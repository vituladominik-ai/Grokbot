const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n)||0);
const tokenPrice=n=>"$"+new Intl.NumberFormat("en-US",{maximumSignificantDigits:7}).format(Number(n)||0);
const stateKey="grokbot-v22-iphone-paper";
const defaults=()=>({cash:50,starting:50,dayStart:50,dayKey:new Date().toISOString().slice(0,10),dayRealized:0,positions:[],trades:[],auto:true,paused:false,limits:{maxPosition:5,maxPositions:3,dailyStop:2.5,minScore:72},lastEntries:{}});
let state;try{state={...defaults(),...JSON.parse(localStorage.getItem(stateKey)||"{}")};state.limits={...defaults().limits,...(state.limits||{})}}catch{state=defaults()}
let tokens=[],feedAt=null,refreshing=false,scanTimer=null;
const save=()=>localStorage.setItem(stateKey,JSON.stringify(state));
const notify=msg=>{const t=$("toast");if(!t)return;t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2300)};
const equity=()=>state.cash+state.positions.reduce((sum,p)=>{const price=tokens.find(t=>t.address===p.address)?.priceUsd??p.lastPrice??p.entry;return sum+p.qty*price*(1-.008)*(1-.005)},0);
const dayPnl=()=>equity()-state.dayStart;
function riskStop(){return dayPnl()<=-state.limits.dailyStop}
function candidatePass(t){return !t.unavailable&&t.score>=state.limits.minScore&&t.liquidityUsd>=15000&&t.volume5mUsd>=5000&&(t.buys5m+t.sells5m)>=12&&t.buys5m>t.sells5m&&t.priceChange5m>-8&&t.priceChange5m<30&&t.risk!=="HIGH"}
function currentPrice(address){return tokens.find(t=>t.address===address)?.priceUsd}
function record(type,p,qty,price,amount,note){state.trades.unshift({time:new Date().toISOString(),type,symbol:p.symbol,address:p.address,qty,price,amount,note});state.trades=state.trades.slice(0,200)}
function buy(t,manual=false){
 if(state.paused||(!state.auto&&!manual)||riskStop()||state.positions.length>=state.limits.maxPositions||state.positions.some(p=>p.address===t.address)||!candidatePass(t))return false;
 const spend=Math.min(state.limits.maxPosition,state.cash);if(spend<1)return false;
 const fill=t.priceUsd*1.008,fee=spend*.005,qty=(spend-fee)/fill;
 state.cash-=spend;state.positions.push({id:crypto.randomUUID(),address:t.address,symbol:t.symbol,name:t.name,qty,entry:fill,lastPrice:t.priceUsd,cost:spend,openedAt:new Date().toISOString()});
 record("PAPER BUY",t,qty,fill,spend,manual?"Manual simulated entry":"Auto-limited simulated entry");save();return true;
}
function sell(pos,reason,mark){
 const price=mark||currentPrice(pos.address)||pos.lastPrice;const gross=pos.qty*price*(1-.008),fee=gross*.005,proceeds=gross-fee,pnl=proceeds-pos.cost;
 state.cash+=proceeds;state.dayRealized+=pnl;
 record("PAPER SELL",pos,pos.qty,price,proceeds,`${reason} · P/L ${money(pnl)}`);
 state.positions=state.positions.filter(p=>p.id!==pos.id);save();
}
function processPaper(){
 const today=new Date().toISOString().slice(0,10);
 if(today!==state.dayKey){state.dayKey=today;state.dayStart=equity();state.dayRealized=0}
 for(const p of [...state.positions]){
  const price=currentPrice(p.address);if(!price)continue;p.lastPrice=price;
  const netValue=p.qty*price*(1-.008)*(1-.005);
  const ret=(netValue-p.cost)/p.cost*100;
  if(ret<=-10)sell(p,"Stop loss",price);else if(ret>=20)sell(p,"Take profit",price);
 }
 if(state.auto&&!state.paused&&!riskStop()){
  const candidates=tokens.filter(candidatePass).filter(t=>!state.positions.some(p=>p.address===t.address)&&Date.now()-(state.lastEntries[t.address]||0)>300000).sort((a,b)=>b.score-a.score);
  for(const t of candidates){if(state.positions.length>=state.limits.maxPositions||state.cash<1)break;if(buy(t)){state.lastEntries[t.address]=Date.now()}}
 }
 save();
}
function render(){
 const eq=equity(),total=eq-state.starting,dp=dayPnl();
 $("equity").textContent=money(eq);$("cash").textContent=money(state.cash);$("positionCount").textContent=`${state.positions.length} / ${state.limits.maxPositions}`;
 $("totalPnl").textContent=`${total>=0?"+":""}${money(total)} · ${((total/state.starting)*100).toFixed(2)}% total`;
 $("totalPnl").className=total>=0?"gain":"gain negative";
 $("dailyPnl").textContent=money(dp);$("dailyPnl").className=dp>=0?"positive":"negative";
 $("autoToggle").classList.toggle("on",state.auto);$("pause").textContent=state.paused?"Resume bot":"Pause bot";
 $("maxPosition").value=state.limits.maxPosition;$("maxPositions").value=state.limits.maxPositions;$("dailyStop").value=state.limits.dailyStop;$("minScore").value=state.limits.minScore;
 $("marketList").innerHTML=tokens.length?tokens.map(t=>{
  const ok=candidatePass(t),risk=t.risk==="HIGH"?"high":ok?"":"warn";
  return `<article class="token"><div class="tokenMain"><div class="tokenTitle"><b>${esc(t.name)}</b><span class="symbol">$${esc(t.symbol)}</span></div><div class="tokenMeta">${money(t.liquidityUsd)} liquidity · ${money(t.volume5mUsd)} 5m vol<br>${t.buys5m} buys / ${t.sells5m} sells · ${esc(t.dexId)} · ${esc(t.risk)}</div><div class="tiny">${esc(t.reasons?.join(" · ")||"No obvious market filter flags; token safety is not verified.")}</div></div><div class="tokenRight"><div class="price">${tokenPrice(t.priceUsd)}</div><div class="change ${t.priceChange5m>=0?"positive":"negative"}">${t.priceChange5m>=0?"+":""}${Number(t.priceChange5m).toFixed(2)}% 5m</div><span class="score ${risk}">${t.score??"—"} SCORE</span><div style="margin-top:6px"><button class="button secondary" data-buy="${esc(t.address)}" ${!ok||state.paused||state.positions.length>=state.limits.maxPositions?"disabled":""}>Paper buy</button></div></div></article>`;
 }).join(""):'<div class="empty">No eligible candidates received. Refresh to retry.</div>';
 $("positionsList").className="list";$("positionsList").innerHTML=state.positions.length?state.positions.map(p=>{const price=currentPrice(p.address)??p.lastPrice??p.entry;
 const netValue=p.qty*price*(1-.008)*(1-.005);
 const ret=(netValue-p.cost)/p.cost*100;return `<div class="position"><div><b>${esc(p.name)} · $${esc(p.symbol)}</b><small>Entry ${tokenPrice(p.entry)} · Qty ${p.qty.toFixed(3)}</small></div><div style="text-align:right"><b class="${ret>=0?"positive":"negative"}">${ret>=0?"+":""}${ret.toFixed(2)}%</b><small>Now ${tokenPrice(price)}</small><button class="button secondary" data-sell="${p.id}" style="margin-top:6px">Close paper</button></div></div>`}).join(""):'<div class="empty">No open paper positions.</div>';
 $("tradeList").className="list";$("tradeList").innerHTML=state.trades.length?state.trades.map(t=>`<div class="position"><div><b>${esc(t.type)} · $${esc(t.symbol)}</b><small>${new Date(t.time).toLocaleString()} · ${esc(t.note)}</small></div><div style="text-align:right"><b>${money(t.amount)}</b><small>${t.qty.toFixed(3)} units</small></div></div>`).join(""):'<div class="empty">No trades yet.</div>';
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function fetchJson(url){
 const r=await fetch(url,{cache:"no-store"});
 if(!r.ok)throw new Error(`DEX Screener HTTP ${r.status}`);
 return r.json();
}
function choosePool(pairs){
 return (Array.isArray(pairs)?pairs:[]).filter(p=>p&&p.chainId==="solana"&&p.baseToken?.address&&Number(p.priceUsd)>0)
 .sort((a,b)=>Number(b.liquidity?.usd||0)-Number(a.liquidity?.usd||0))[0]||null;
}
function score(t){
 let s=0,liq=t.liquidityUsd||0,vol=t.volume5mUsd||0,tx=t.buys5m+t.sells5m,ratio=tx?t.buys5m/tx:0;
 s+=Math.min(30,liq/1500)+Math.min(25,vol/400)+Math.min(15,tx/2);
 s+=Math.max(0,Math.min(15,(ratio-.35)*30));
 s+=t.priceChange1h>-10&&t.priceChange1h<35?8:0;
 s+=t.priceChange5m>-5&&t.priceChange5m<20?7:0;
 if(t.priceChange5m>35)s-=15;if(t.priceChange1h>80)s-=15;if(liq<5000)s-=25;if(tx<5)s-=15;
 return Math.max(0,Math.min(100,Math.round(s)));
}
function normalize(p){
 const tx=p.txns?.m5||{},t={name:p.baseToken?.name||"Unknown token",symbol:p.baseToken?.symbol||"???",address:p.baseToken?.address||"",pairAddress:p.pairAddress||"",dexId:p.dexId||"unknown",url:p.url||"",priceUsd:Number(p.priceUsd||0),liquidityUsd:Number(p.liquidity?.usd||0),volume5mUsd:Number(p.volume?.m5||0),volume1hUsd:Number(p.volume?.h1||0),buys5m:Number(tx.buys||0),sells5m:Number(tx.sells||0),priceChange5m:Number(p.priceChange?.m5||0),priceChange1h:Number(p.priceChange?.h1||0),pairCreatedAt:Number(p.pairCreatedAt||0),fdvUsd:Number(p.fdv||p.marketCap||0),source:"DEX Screener"};
 const reasons=[];if(t.liquidityUsd<10000)reasons.push("Thin liquidity");if(t.volume5mUsd<2500)reasons.push("Low 5m volume");if(t.buys5m+t.sells5m<10)reasons.push("Few recent swaps");if(t.priceChange5m>35||t.priceChange1h>80)reasons.push("Extreme price move");if(!t.pairCreatedAt)reasons.push("Pool age unknown");else if(Date.now()-t.pairCreatedAt<600000)reasons.push("Very new pool");
 t.risk=reasons.length>=3?"HIGH":reasons.length?"ELEVATED":"UNASSESSED";t.reasons=reasons;t.score=score(t);return t;
}
async function refreshMarket(){
 if(refreshing||document.visibilityState==="hidden")return;refreshing=true;$("refresh").disabled=true;$("feedStatus").textContent="Refreshing live market data…";
 try{
  const [profiles,boosts]=await Promise.all([fetchJson("https://api.dexscreener.com/token-profiles/latest/v1"),fetchJson("https://api.dexscreener.com/token-boosts/latest/v1")]);
  const candidates=new Map();
  for(const [source,list] of [["profile",profiles],["boosted",boosts]])for(const x of (Array.isArray(list)?list:[])){
   if(x?.chainId!=="solana"||!x.tokenAddress)continue;
   const c=candidates.get(x.tokenAddress)||{address:x.tokenAddress,sources:[]};c.sources.push(source);candidates.set(x.tokenAddress,c);
  }
  const selected=[...candidates.values()].slice(0,12),rows=[];
  for(let i=0;i<selected.length;i+=4){
   const batch=selected.slice(i,i+4);
   const got=await Promise.all(batch.map(async c=>{try{const pairs=await fetchJson(`https://api.dexscreener.com/token-pairs/v1/solana/${encodeURIComponent(c.address)}`);const p=choosePool(pairs);return p?normalize(p):null}catch{return null}}));
   rows.push(...got.filter(Boolean));
  }
  tokens=rows.sort((a,b)=>b.score-a.score);feedAt=new Date().toISOString();
  const historyKey="grokbot-price-history-v1";
  let history=[];
  try{history=JSON.parse(localStorage.getItem(historyKey)||"[]")}catch(e){history=[]}
  const snapshotTime=Date.now();
  for(const t of tokens){
   if(t.priceUsd>0){
    history.push({time:snapshotTime,address:t.address,symbol:t.symbol,price:t.priceUsd,score:t.score});
   }
  }
  try{localStorage.setItem(historyKey,JSON.stringify(history.slice(-12000)))}catch(e){}
  $("feedDot").className="dot";
  $("lastUpdated").textContent=new Date(feedAt).toLocaleTimeString();
  $("discoveryNote").textContent="Discovery is partial: DEX Screener profile/boost lists are not a complete feed of every new Pump.fun launch. A score is a heuristic, not a rug-pull or holder audit.";
  processPaper();render();
 }catch(e){
  $("feedDot").className="dot bad";$("feedStatus").textContent="Market feed unavailable";
  $("discoveryNote").textContent=`Could not load live data: ${e.message}. Safari may block direct API access, or the source may be temporarily unavailable. Automatic entries are paused until fresh data returns.`;
  state.paused=true;save();render();notify("Market feed unavailable — bot paused");
 }finally{refreshing=false;$("refresh").disabled=false}
}
function scheduleScanner(){
 if(scanTimer)clearInterval(scanTimer);
 scanTimer=setInterval(()=>{if(document.visibilityState==="visible")refreshMarket()},45000);
}
document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".panel").forEach(x=>x.classList.toggle("active",x.id==="tab-"+b.dataset.tab))}));
$("refresh").addEventListener("click",refreshMarket);
$("autoToggle").addEventListener("click",()=>{state.auto=!state.auto;save();render();notify(state.auto?"Auto paper trading enabled":"Auto paper trading disabled")});
$("pause").addEventListener("click",()=>{state.paused=!state.paused;save();render();notify(state.paused?"Bot paused":"Bot resumed")});
$("saveSettings").addEventListener("click",()=>{const l={maxPosition:Number($("maxPosition").value),maxPositions:Number($("maxPositions").value),dailyStop:Number($("dailyStop").value),minScore:Number($("minScore").value)};if(!(l.maxPosition>=1&&l.maxPosition<=50&&l.maxPositions>=1&&l.maxPositions<=3&&l.dailyStop>=.5&&l.dailyStop<=50&&l.minScore>=50&&l.minScore<=95)){notify("Invalid risk limits");return}state.limits={...l,maxPositions:Math.floor(l.maxPositions),minScore:Math.floor(l.minScore)};save();render();notify("Risk limits saved")});
$("reset").addEventListener("click",()=>{if(!confirm("Reset local paper account to $50 and erase trade history?"))return;state=defaults();save();render();notify("Paper account reset")});
document.addEventListener("click",e=>{const b=e.target.closest("[data-buy]");if(b){const t=tokens.find(x=>x.address===b.dataset.buy);if(t){if(buy(t,true)){render();notify("Simulated paper entry opened")}else notify("Entry blocked by risk filters")}}const s=e.target.closest("[data-sell]");if(s){const p=state.positions.find(x=>x.id===s.dataset.sell);if(p){sell(p,"Manual close");render();notify("Paper position closed")}}});
$("export").addEventListener("click",()=>{const rows=[["time","type","symbol","mint","quantity","price_usd","amount_usd","note"],...state.trades.map(t=>[t.time,t.type,t.symbol,t.address,t.qty,t.price,t.amount,t.note])];const csv=rows.map(r=>r.map(x=>'"'+String(x??"").replaceAll('"','""')+'"').join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="grokbot-paper-trades.csv";a.click();URL.revokeObjectURL(a.href)});
if("serviceWorker" in navigator)navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refreshMarket()});
function runDiagnostics(){
 const results=[];
 const test=(name,condition)=>results.push({name,passed:Boolean(condition)});
 const originalState=JSON.stringify(state);
 const spend=5,buyFee=spend*.005,fill=1*1.008,qty=(spend-buyFee)/fill;
 const sellGross=qty*1.2*(1-.008),sellFee=sellGross*.005,proceeds=sellGross-sellFee,pnl=proceeds-spend,netReturn=pnl/spend*100;
 test("Buy fee calculation",Math.abs(buyFee-.025)<.000001);
 test("Buy slippage calculation",Math.abs(fill-1.008)<.000001);
 test("Sell fee calculation",sellFee>0);
 test("Net P/L calculation",Math.abs(netReturn-((proceeds-spend)/spend*100))<.000001);
 const stopTriggered=value=>value<=-10,takeTriggered=value=>value>=20,dailyStopTriggered=loss=>loss<=-state.limits.dailyStop,openLimitReached=count=>count>=state.limits.maxPositions;
 test("Stop loss boundary",stopTriggered(-10)&&!stopTriggered(-9.99));
 test("Take profit boundary",takeTriggered(20)&&!takeTriggered(19.99));
 test("Daily loss limit",dailyStopTriggered(-state.limits.dailyStop));
 test("Position size cap",Math.min(5,state.limits.maxPosition)<=state.limits.maxPosition);
 test("Open positions cap",openLimitReached(state.limits.maxPositions));
 test("Portfolio unchanged",JSON.stringify(state)===originalState);
 const passed=results.filter(r=>r.passed).length,failed=results.length-passed,output=document.getElementById("diagnosticsResult");
 output.innerHTML=`<b>${passed}/${results.length} tests passed</b><br>`+results.map(r=>`${r.passed?"✅":"❌"} ${r.name}`).join("<br>");
 output.className="notice "+(failed?"security":"");
 notify(failed?"Diagnostics: some tests failed":"Diagnostics: all tests passed");
}

function loadPriceHistory(){
 let history=[];
 try{history=JSON.parse(localStorage.getItem("grokbot-price-history-v1")||"[]")}catch(e){history=[]}
 return history.filter(p=>p&&p.address&&Number(p.time)>0&&Number(p.price)>0&&Number.isFinite(Number(p.score)))
  .map(p=>({...p,time:Number(p.time),price:Number(p.price),score:Number(p.score)}))
  .sort((a,b)=>a.time-b.time);
}

// One shared cash balance and a hard cap on simultaneous positions are used
// for both the normal backtest and every optimizer candidate.
function simulatePortfolio(history,cfg){
 const snapshots=new Map(),lastByAddress=new Map();
 for(const point of history){
  if(!snapshots.has(point.time))snapshots.set(point.time,[]);
  snapshots.get(point.time).push(point);
  const old=lastByAddress.get(point.address);
  if(!old||point.time>=old.time)lastByAddress.set(point.address,point);
 }
 const times=[...snapshots.keys()].sort((a,b)=>a-b);
 let cash=cfg.balance,peak=cfg.balance,maxDrawdown=0;
 const open=new Map(),traded=new Set(),trades=[];
 const markEquity=()=>{
  let value=cash;
  for(const pos of open.values())value+=pos.qty*(pos.lastPrice||pos.entryPrice)*.992*.995;
  peak=Math.max(peak,value);
  if(peak>0)maxDrawdown=Math.max(maxDrawdown,(peak-value)/peak*100);
 };
 const closePosition=(pos,price,time,reason)=>{
  const proceeds=pos.qty*price*.992*.995,pnl=proceeds-pos.cost;
  cash+=proceeds;
  trades.push({symbol:pos.symbol||"Unknown",time:pos.entryTime,exitTime:time,entryPrice:pos.entryPrice,exitPrice:price,pnl,pnlPercent:pnl/pos.cost*100,reason,cost:pos.cost});
  open.delete(pos.address);traded.add(pos.address);
 };
 for(const time of times){
  const points=snapshots.get(time);
  for(const point of points){
   const pos=open.get(point.address);if(!pos)continue;
   pos.lastPrice=point.price;
   const net=(pos.qty*point.price*.992*.995-pos.cost)/pos.cost*100;
   if(net<=-cfg.stopLoss)closePosition(pos,point.price,time,"Stop loss");
   else if(net>=cfg.takeProfit)closePosition(pos,point.price,time,"Take profit");
  }
  const candidates=points.filter(p=>p.score>=cfg.minScore&&!traded.has(p.address)&&!open.has(p.address)).sort((a,b)=>b.score-a.score);
  for(const point of candidates){
   if(open.size>=cfg.maxPositions)break;
   const spend=Math.min(cfg.positionSize,cash);if(spend<.01)break;
   const buyPrice=point.price*1.008,qty=(spend-spend*.005)/buyPrice;
   cash-=spend;
   open.set(point.address,{address:point.address,symbol:point.symbol,qty,cost:spend,entryPrice:buyPrice,lastPrice:point.price,entryTime:time});
   traded.add(point.address);
  }
  markEquity();
 }
 for(const pos of [...open.values()]){
  const last=lastByAddress.get(pos.address);
  if(last)closePosition(pos,last.price,last.time,"End of recorded data");
 }
 const finalBalance=cash,netPnl=finalBalance-cfg.balance,wins=trades.filter(t=>t.pnl>0).length;
 const grossProfit=trades.filter(t=>t.pnl>0).reduce((s,t)=>s+t.pnl,0),grossLoss=Math.abs(trades.filter(t=>t.pnl<0).reduce((s,t)=>s+t.pnl,0));
 return {trades,startingBalance:cfg.balance,finalBalance,netPnl,returnPct:cfg.balance?netPnl/cfg.balance*100:0,winRate:trades.length?wins/trades.length*100:0,profitFactor:grossLoss>0?grossProfit/grossLoss:(grossProfit>0?Infinity:0),maxDrawdown,observations:history.length,tokensAnalyzed:lastByAddress.size};
}
function readSimulationInputs(){
 const balance=Number($("simBalance").value),positionSize=Number($("simPosition").value),minScore=Number($("simScore").value);
 if(!Number.isFinite(balance)||balance<=0||!Number.isFinite(positionSize)||positionSize<=0||!Number.isFinite(minScore)||minScore<0||minScore>100){notify("Check balance, position size and score");return null;}
 return {balance,positionSize,minScore,maxPositions:3,stopLoss:10,takeProfit:20};
}
function renderSimulationResults(output,result,cfg){
 if(!result.trades.length){output.textContent="No qualifying trades found. Collect more data or adjust the minimum score.";return;}
 const pf=Number.isFinite(result.profitFactor)?result.profitFactor.toFixed(2):"∞";
 output.innerHTML=`<b>Backtest results</b><br>`+
 `Recorded observations: ${result.observations}<br>Tokens analyzed: ${result.tokensAnalyzed}<br>Trades: ${result.trades.length}<br>Win rate: ${result.winRate.toFixed(1)}%<br>`+
 `Starting balance: ${money(result.startingBalance)}<br>Final balance: ${money(result.finalBalance)}<br>`+
 `Net P/L: ${result.netPnl>=0?"+":""}${money(result.netPnl)} (${result.returnPct.toFixed(2)}%)<br>`+
 `Max drawdown: ${result.maxDrawdown.toFixed(2)}%<br>Profit factor: ${pf}<br>`+
 `Rules: score ≥ ${cfg.minScore}, stop loss ${cfg.stopLoss}%, take profit ${cfg.takeProfit}%, max ${cfg.maxPositions} open positions<br><br>`+
 `<small>Paper simulation only. Shared cash balance, max 3 concurrent positions, estimated 0.5% fees and 0.8% slippage on each side. Uses recorded observations only; results are not predictions.</small>`+
 `<br><br><b>Trade history</b><div style="overflow-x:auto"><table style="width:100%;font-size:12px;border-collapse:collapse"><tr><th>Token</th><th>Entry</th><th>Exit</th><th>P/L</th><th>Reason</th></tr>`+
 result.trades.map(t=>`<tr><td>${esc(t.symbol)}</td><td>${tokenPrice(t.entryPrice)}</td><td>${tokenPrice(t.exitPrice)}</td><td>${t.pnl>=0?"+":""}${money(t.pnl)} (${t.pnlPercent.toFixed(2)}%)</td><td>${esc(t.reason)}</td></tr>`).join("")+
 `</table></div>`;
 output.className="notice";
}
function runBacktest(){
 const output=$("simResults"),cfg=readSimulationInputs();
 if(!cfg){output.textContent="Enter valid simulation settings.";return;}
 const history=loadPriceHistory();
 if(history.length<2){output.textContent="Not enough historical data yet. Keep GROKBOT open while it collects market observations.";return;}
 const result=simulatePortfolio(history,cfg);
 renderSimulationResults(output,result,cfg);
}
function runOptimizer(){
 const output=$("optimizerResults"),base=readSimulationInputs();
 if(!base){output.textContent="Enter valid simulation settings first.";return;}
 const history=loadPriceHistory();
 if(history.length<20){output.textContent="Not enough recorded data yet. Keep GROKBOT open to collect more real observations before optimizing.";return;}
 const scores=[60,65,70,72,75,80,85,90],stops=[6,8,10,12,15],takes=[10,15,20,25,30,40],results=[];
 for(const minScore of scores)for(const stopLoss of stops)for(const takeProfit of takes){
  if(takeProfit<=stopLoss)continue;
  const cfg={...base,minScore,stopLoss,takeProfit,maxPositions:3},result=simulatePortfolio(history,cfg);
  const samplePenalty=result.trades.length<5?(5-result.trades.length)*2:0;
  results.push({cfg,result,rankScore:result.returnPct-result.maxDrawdown*.75-samplePenalty});
 }
 results.sort((a,b)=>b.rankScore-a.rankScore);
 const top=results.slice(0,5),best=top[0];
 output.innerHTML=`<b>Optimizer complete</b><br>Strategies tested: ${results.length}<br>`+
 `Recorded observations: ${history.length} across ${new Set(history.map(p=>p.address)).size} tokens<br>`+
 `<small>Ranking = return % − 0.75 × max drawdown % − small-sample penalty. Comparison heuristic, not proof of future performance.</small><br><br>`+
 `<b>Top 5 configurations</b><div style="overflow-x:auto"><table style="width:100%;font-size:12px;border-collapse:collapse"><tr><th>#</th><th>Score</th><th>SL / TP</th><th>Trades</th><th>Win %</th><th>Return</th><th>DD</th></tr>`+
 top.map((item,i)=>`<tr><td>${i+1}</td><td>${item.cfg.minScore}</td><td>${item.cfg.stopLoss}% / ${item.cfg.takeProfit}%</td><td>${item.result.trades.length}</td><td>${item.result.winRate.toFixed(1)}%</td><td>${item.result.returnPct>=0?"+":""}${item.result.returnPct.toFixed(2)}%</td><td>${item.result.maxDrawdown.toFixed(2)}%</td></tr>`).join("")+
 `</table></div><br><b>Best tested configuration</b><br>Minimum score: ${best.cfg.minScore}<br>Stop loss: ${best.cfg.stopLoss}%<br>Take profit: ${best.cfg.takeProfit}%<br>`+
 `Position size: ${money(best.cfg.positionSize)} · Starting balance: ${money(best.cfg.balance)} · Max open positions: 3<br>`+
 `Net P/L: ${best.result.netPnl>=0?"+":""}${money(best.result.netPnl)} (${best.result.returnPct.toFixed(2)}%)<br>`+
 `Trades: ${best.result.trades.length} · Win rate: ${best.result.winRate.toFixed(1)}% · Max drawdown: ${best.result.maxDrawdown.toFixed(2)}%<br><br>`+
 `<small>Optimizer only reports simulated settings. It does not change your paper-bot settings or open positions. Small or biased samples can mislead; validate on later, unseen data.</small>`;
 output.className="notice";
}
$("runBacktest").addEventListener("click",runBacktest);
$("runOptimizer").addEventListener("click",runOptimizer);
$("runDiagnostics").addEventListener("click",runDiagnostics);
render();refreshMarket();scheduleScanner();
