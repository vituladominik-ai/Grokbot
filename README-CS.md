# GROKBOT v2.2 — iPhone-only PAPER build

## Co tato verze umí
- Statická webová aplikace pro Safari na iPhonu; nepotřebuje běžící PC ani Node server.
- Načítá kandidáty z veřejných DEX Screener profile/boost seznamů a dohledává jejich Solana pooly.
- Vyhodnocuje základní tržní metriky a rizikové varovné signály.
- Simuluje obchody s virtuálním účtem 50 USD.
- Limity: max. pozice 5 USD, max. 3 otevřené pozice, denní stop 2.50 USD, automatické paper vstupy.
- Ukládá paper stav a historii lokálně v Safari (localStorage); exportuje CSV.

## Důležitá omezení
- Žádná peněženka, seed phrase, privátní klíč ani skutečný nákup/prodej.
- DEX Screener profile/boost endpointy jsou jen částečný zdroj kandidátů. Nejde o kompletní feed všech nových Pump.fun launchů.
- Přímé volání DEX Screener API z mobilního Safari závisí na dostupnosti API a CORS pravidlech. Pokud Safari požadavek zablokuje, aplikace zobrazí chybu a automatické paper vstupy pozastaví.
- iOS může Safari pozastavit i při zapnutém displeji. Scanner funguje jen dokud stránka zůstává aktivní; 24/7 provoz není garantovaný.
- Data a historie jsou lokální v konkrétním Safari profilu. Smazání dat webu může vymazat paper účet.

## Jak otevřít na iPhonu
1. Nahraj obsah této složky jako statický web na HTTPS hosting (např. GitHub Pages nebo Netlify).
2. Otevři výslednou HTTPS adresu v Safari na iPhonu.
3. Zkus tlačítko Refresh a ověř, že se zobrazí stav „Live DEX observations“.
4. Přes Sdílet → Přidat na plochu můžeš vytvořit ikonu.
5. V Nastavení iPhonu → Zobrazení a jas → Uzamčení nastav dočasně delší dobu / Nikdy a nech telefon na nabíječce. Přesto iOS může stránku pozastavit.
6. Nejdřív nech běžet paper režim a sleduj výsledky. Neposílej žádné peníze.

## Testování
Tento balíček je statický a nevyžaduje PC server. V tomto běhovém prostředí nebylo možné ověřit externí DEX Screener konektivitu ani reálné chování Safari na iPhonu. Před používáním je nutný test přímo na zařízení.
