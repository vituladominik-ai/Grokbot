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
 if(refreshing||document.visibilityState==="hidden")return;refreshing=true;$("refresh").disabled=true;$("feedStatus").textContent="Refreshing live DEX data…";
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
    history.push({
      time:snapshotTime,
      address:t.address,
      symbol:t.symbol,
      price:t.priceUsd,
      score:t.score
    });
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

  const spend=5;
  const buyFee=spend*.005;
  const fill=1*1.008;
  const qty=(spend-buyFee)/fill;
  const sellGross=qty*1.2*(1-.008);
  const sellFee=sellGross*.005;
  const proceeds=sellGross-sellFee;
  const pnl=proceeds-spend;
  const netReturn=pnl/spend*100;

  test("Buy fee calculation",Math.abs(buyFee-.025)<.000001);
test("Buy slippage calculation",Math.abs(fill-1.008)<.000001);
test("Sell fee calculation",sellFee>0);
test("Net P/L calculation",Math.abs(netReturn-((proceeds-spend)/spend*100))<.000001);

const stopTriggered=value=>value<=-10;
const takeTriggered=value=>value>=20;
const dailyStopTriggered=loss=>loss<=-state.limits.dailyStop;
const openLimitReached=count=>count>=state.limits.maxPositions;

test("Stop loss boundary",stopTriggered(-10)&&!stopTriggered(-9.99));
test("Take profit boundary",takeTriggered(20)&&!takeTriggered(19.99));
test("Daily loss limit",dailyStopTriggered(-state.limits.dailyStop));
test("Position size cap",Math.min(5,state.limits.maxPosition)<=state.limits.maxPosition);
test("Open positions cap",openLimitReached(state.limits.maxPositions));
test("Portfolio unchanged",JSON.stringify(state)===originalState);

  const passed=results.filter(r=>r.passed).length;
  const failed=results.length-passed;
  const output=document.getElementById("diagnosticsResult");

  output.innerHTML=
    `<b>${passed}/${results.length} tests passed</b><br>`+
    results.map(r=>
      `${r.passed?"✅":"❌"} ${r.name}`
    ).join("<br>");

  output.className="notice "+(failed?"security":"");
  notify(failed?"Diagnostics: some tests failed":"Diagnostics: all tests passed");
}


function runBacktest(){
  const output=$("simResults");
  const balanceStart=Number($("simBalance").value);
  const positionSize=Number($("simPosition").value);
  const minScore=Number($("simScore").value);

  if(!balanceStart||!positionSize||positionSize<=0){
    output.textContent="Enter a valid balance and position size.";
    return;
  }

  let history=[];
  try{
    history=JSON.parse(localStorage.getItem("grokbot-price-history-v1")||"[]");
  }catch(e){
    history=[];
  }

  history=history.filter(p=>
    p&&p.address&&Number(p.time)>0&&
    Number(p.price)>0&&Number.isFinite(Number(p.score))
  );

  if(history.length<2){
    output.textContent="Not enough historical data yet. Keep GROKBOT open while it collects market observations.";
    return;
  }

  const grouped={};
  for(const point of history){
    if(!grouped[point.address])grouped[point.address]=[];
    grouped[point.address].push(point);
  }

  const trades=[];

  for(const address of Object.keys(grouped)){
    const points=grouped[address].sort((a,b)=>a.time-b.time);
    if(points.length<2)continue;

    const entry=points.find(p=>Number(p.score)>=minScore);
    if(!entry)continue;

    const spend=Math.min(positionSize,balanceStart);
    const buyFee=spend*.005;
    const buyPrice=Number(entry.price)*1.008;
    const quantity=(spend-buyFee)/buyPrice;

    let exit=points[points.length-1];
    let reason="End of recorded data";

    for(const point of points){
      if(point.time<=entry.time)continue;
      const proceeds=quantity*Number(point.price)*.992*.995;
      const pnl=proceeds-spend;
      const percent=pnl/spend*100;

      if(percent<=-10){
        exit=point;
        reason="Stop loss";
        break;
      }
      if(percent>=20){
        exit=point;
        reason="Take profit";
        break;
      }
    }

    const sellValue=quantity*Number(exit.price)*.992*.995;
    trades.push({
      symbol:entry.symbol||"Unknown",
      time:Number(entry.time),
      pnl:sellValue-spend,
      reason
    });
  }

  trades.sort((a,b)=>a.time-b.time);

  if(!trades.length){
    output.textContent=
      "No qualifying trades found. Collect more data or adjust the minimum score.";
    return;
  }

  let balance=balanceStart;
  let peak=balanceStart;
  let maxDrawdown=0;
  let wins=0;
  let grossProfit=0;
  let grossLoss=0;

  for(const trade of trades){
    const actualSpend=Math.min(positionSize,balance);
    if(actualSpend<=0)break;

    const scale=actualSpend/Math.min(positionSize,balanceStart);
    const pnl=trade.pnl*scale;

    balance+=pnl;
    if(pnl>0){
      wins++;
      grossProfit+=pnl;
    }else{
      grossLoss+=Math.abs(pnl);
    }

    peak=Math.max(peak,balance);
    const drawdown=peak>0?(peak-balance)/peak*100:0;
    maxDrawdown=Math.max(maxDrawdown,drawdown);
  }

  const completed=trades.length;
  const netPnl=balance-balanceStart;
  const returnPct=netPnl/balanceStart*100;
  const winRate=wins/completed*100;
  const profitFactor=grossLoss>0?(grossProfit/grossLoss).toFixed(2):"N/A";

  output.innerHTML=
    `<b>Backtest results</b><br>`+
    `Recorded observations: ${history.length}<br>`+
    `Tokens analyzed: ${Object.keys(grouped).length}<br>`+
    `Trades: ${completed}<br>`+
    `Win rate: ${winRate.toFixed(1)}%<br>`+
    `Starting balance: $${balanceStart.toFixed(2)}<br>`+
    `Final balance: $${balance.toFixed(2)}<br>`+
    `Net P/L: ${netPnl>=0?"+":""}$${netPnl.toFixed(2)} (${returnPct.toFixed(2)}%)<br>`+
    `Max drawdown: ${maxDrawdown.toFixed(2)}%<br>`+
    `Profit factor: ${profitFactor}<br><br>`+
    `<small>Paper simulation only. Uses recorded observations, estimated fees and slippage. Small samples are not reliable predictions.</small>`;

  output.className="notice";
}

$("runBacktest").addEventListener("click",runBacktest);
$("runDiagnostics").addEventListener("click",runDiagnostics);

render();refreshMarket();scheduleScanner();

