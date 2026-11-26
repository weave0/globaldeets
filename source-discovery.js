/* GD-056: no fetching of external publishers; only live authority and direct navigation. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const root = byId('discovery-results');
  if (!root) return;
  const controls = ['discovery-search','discovery-region','discovery-language','discovery-status-filter','discovery-clear'].map(byId);
  const [search,region,language,filter,clear] = controls;
  const REGIONS = new Set(['global','africa','americas','asia','europe','middle-east','pacific']);
  const STATUS = ['research','link-only','monitored'];
  const RIGHTS = new Set(['verified-public-use','permission-required','contract-required','unknown','prohibited']);
  const labels = {research:'Feed research only','link-only':'Direct website links',monitored:'Configured feeds'};
  const rightsLabels = {'verified-public-use':'Bounded reuse policy reviewed; not admission or per-item clearance','permission-required':'Permission review required','contract-required':'Contract or licensing review required','unknown':'Reuse permission unresolved','prohibited':'Reviewed use prohibited','not-reviewed':'Reuse rights not reviewed'};
  const langName = code => {
    try { return new Intl.DisplayNames(['en'],{type:'language'}).of(code) || code; }
    catch { return code; }
  };
  const countryName = code => {
    try { return new Intl.DisplayNames(['en'],{type:'region'}).of(code) || code; }
    catch { return code; }
  };
  let data = null, generation = 0;
  const text = (value,max=700) => typeof value === 'string' && value.trim() && value.length <= max;
  const validLangs = langs => Array.isArray(langs) && langs.length > 0 && langs.length <= 60 &&
    new Set(langs).size === langs.length && langs.every(lang => /^[a-z]{2,3}$/.test(lang));
  const validDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value+'T00:00:00Z');
    return Number.isFinite(d.valueOf()) && d.toISOString().slice(0,10) === value;
  };
  function safeUrl(value) {
    if (typeof value !== 'string' || value.length > 2048) return false;
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password &&
      !url.port && url.hostname.includes('.') && !url.hostname.endsWith('.local') &&
      !/^\d+(?:\.\d+){3}$/.test(url.hostname) && url.href === value; }
    catch { return false; }
  }
  function valid(payload) {
    if (!payload || payload.version !== 'gd056-discovery-v1' || payload.scope !== 'configured-feeds-and-reviewed-navigation-links' ||
        payload.validation?.valid !== true || !text(payload.sourceFingerprint,120) ||
        !text(payload.admissionFingerprint,120) || !validDate(payload.reviewedAt) ||
        !Array.isArray(payload.entries) || payload.entries.length > 2000 || !validLangs(payload.feedLanguages) ||
        ['automaticAdmission','eventLocationInference','externalArticleCollection','languageEditionImpliesIndependentPublisher','linkImpliesReusePermission'].some(rule => payload.rules?.[rule] !== false)) return false;
    const ids = new Set(), monitored = new Set(), langs = new Set(), counts = {monitored:0,research:0,linkOnly:0};
    for (const entry of payload.entries) {
      if (!entry || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id || '') || ids.has(entry.id) ||
          !text(entry.name,140) || !text(entry.focus,160) || !text(entry.note) ||
          !STATUS.includes(entry.status) || !REGIONS.has(entry.region) || !validLangs(entry.languages) ||
          !validDate(entry.reviewedAt) || !Array.isArray(entry.evidenceUrls) || !entry.evidenceUrls.length ||
          !entry.evidenceUrls.every(safeUrl)) return false;
      ids.add(entry.id);
      if (entry.status === 'monitored') {
        if (entry.languageBasis !== 'configured-feed' || entry.languages.length !== 1 ||
            !RIGHTS.has(entry.rights) || entry.url != null || entry.relatedSourceId != null ||
            (entry.country != null && !/^[A-Z]{2}$/.test(entry.country))) return false;
        monitored.add(entry.id); langs.add(entry.languages[0]); counts.monitored++;
      } else {
        if (entry.languageBasis !== 'publisher-page-or-listed-edition' || !safeUrl(entry.url) ||
            !Array.isArray(entry.editions) || entry.editions.length > 60 ||
            !entry.editions.every(edition => edition && entry.languages.includes(edition.lang) && safeUrl(edition.url))) return false;
        if (entry.status === 'research') {
          if (!RIGHTS.has(entry.rights) || entry.health !== 'not-certified' || !validDate(entry.rightsReviewedAt) ||
              typeof entry.itemLevelReviewRequired !== 'boolean' || !Array.isArray(entry.policyUrls) ||
              !entry.policyUrls.every(safeUrl) || entry.relatedSourceId != null) return false;
          counts.research++;
        } else {
          if (entry.rights !== 'not-reviewed' || !entry.evidenceUrls.includes(entry.url)) return false;
          counts.linkOnly++;
        }
      }
    }
    return counts.monitored > 0 && Object.keys(counts).every(key => counts[key] === payload.counts?.[key]) &&
      langs.size === payload.feedLanguages.length && payload.feedLanguages.every(lang => langs.has(lang)) &&
      payload.entries.every(entry => entry.relatedSourceId == null || monitored.has(entry.relatedSourceId));
  }
  function el(tag,value,cls) {
    const node = document.createElement(tag);
    if (value != null) node.textContent = value;
    if (cls) node.className = cls;
    return node;
  }
  function link(href,label,cls,external=true) {
    if (external && !safeUrl(href)) return null;
    const a = el('a',label,cls);
    a.href = href;
    if (external) { a.target='_blank'; a.rel='noopener noreferrer'; a.append(el('span',' (opens in a new tab)','visually-hidden')); }
    return a;
  }
  function record(entry) {
    const article = el('article',null,'discovery-record');
    article.dataset.status = entry.status; article.dataset.sourceId = entry.id;
    article.append(el('p',entry.status==='monitored'?'Configured feed':entry.status==='research'?'Feed research only':'Direct link only','discovery-label'),
      el('h4',entry.name),
      el('p',(entry.status==='monitored'?'Feed language: ':'Website / listed edition language: ')+entry.languages.map(langName).join(', ')),
      el('p',entry.status==='monitored'?'Publisher origin: '+(entry.country?countryName(entry.country):'not recorded')+' · Scope: '+entry.focus:'Coverage focus: '+entry.focus),
      el('p',entry.note));
    if (entry.relatedSourceId) article.append(link('/source-network.html?source='+encodeURIComponent(entry.relatedSourceId),'Related monitored publisher',null,false));
    if (entry.status === 'monitored') {
      article.append(link('/source-network.html?source='+encodeURIComponent(entry.id),'Inspect publisher record','discovery-primary',false));
    } else {
      const selectedEdition=entry.editions?.find(edition=>edition.lang===language.value);
      article.append(link(selectedEdition?.url || entry.url,selectedEdition ? 'Read '+langName(selectedEdition.lang)+' edition' : 'Open publisher website','discovery-primary'));
    }
    if (entry.editions?.length) {
      const wrap = el('details');
      wrap.append(el('summary','Publisher-listed language editions'));
      const links = el('div',null,'discovery-editions');
      for (const edition of entry.editions) {
        const a=link(edition.url,langName(edition.lang)); links.append(a);
      }
      wrap.append(links,el('p','Listed editions may be inactive or translated; these are not additional monitored feeds.'));
      if (entry.editions.some(edition => edition.lang === language.value)) wrap.open=true;
      article.append(wrap);
    }
    const details = el('details');
    details.append(el('summary','Evidence and review status'),el('p',rightsLabels[entry.rights]),
      el('p','Directory / provenance review: '+entry.reviewedAt));
    if (entry.status==='research') details.append(el('p','Rights ledger reviewed: '+entry.rightsReviewedAt+
      '. Feed health is not certified. '+(entry.itemLevelReviewRequired?'Item-level review is required.':'Separate admission gates still apply.')));
    const refs=el('ul');
    entry.evidenceUrls.forEach((url,index)=>{
      const li=el('li');
      li.append(link(url,(entry.policyUrls?.includes(url)?'Publisher usage policy':'Source reference')+' '+(index+1)));
      refs.append(li);
    });
    details.append(refs);
    article.append(details);
    return article;
  }
  function render() {
    if (!data) return;
    const q=search.value.trim().toLocaleLowerCase('en');
    const feedLangs=new Set(data.feedLanguages);
    const found=data.entries.filter(entry => {
      const st=filter.value;
      if (st==='additional' && entry.status==='monitored' || STATUS.includes(st) && entry.status!==st) return false;
      if (region.value!=='all' && entry.region!==region.value) return false;
      if (language.value==='unrepresented' && !entry.languages.some(lang=>!feedLangs.has(lang))) return false;
      if (!['all','unrepresented'].includes(language.value) && !entry.languages.includes(language.value)) return false;
      return !q || [entry.name,entry.focus,entry.country?countryName(entry.country):'',entry.note,...entry.languages.map(langName)]
        .join(' ').toLocaleLowerCase('en').includes(q);
    });
    root.replaceChildren();
    byId('discovery-status').textContent=found.length+' matching directory record'+(found.length===1?'':'s')+
      '. Records are not counts of independent publishers or active feeds.';
    for (const kind of STATUS) {
      const rows=found.filter(entry=>entry.status===kind).sort((a,b)=>a.name.localeCompare(b.name));
      if (!rows.length) continue;
      const group=el('section',null,'discovery-group');
      group.append(el('h3',labels[kind]+' · '+rows.length));
      const grid=el('div',null,'discovery-grid');
      for (const entry of rows) grid.append(record(entry));
      group.append(grid); root.append(group);
    }
    if (!found.length) root.append(el('p','No directory records match these filters. This does not mean reporting in that place or language is absent.'));
    root.setAttribute('aria-busy','false');
  }
  function sync() {
    try {
      const url=new URL(location.href);
      for (const [key,value,defaultValue] of [['region',region.value,'all'],['lang',language.value,'all'],['status',filter.value,'additional']]) {
        if (value===defaultValue) url.searchParams.delete(key); else url.searchParams.set(key,value);
      }
      // Search terms remain local and are never sent or added to shareable URLs.
      history.replaceState(history.state,'',url);
    } catch { /* browsing works without history */ }
    render();
  }
  function unavailable() {
    data=null; controls.forEach(control=>{control.disabled=true;});
    ['monitored','feed-languages','research','direct'].forEach(key=>{byId('discovery-'+key).textContent='—';});
    byId('discovery-gap').textContent='Configured-language comparison is unavailable.';
    byId('discovery-review').textContent='';
    byId('discovery-status').textContent='Discovery registry unavailable or inconsistent. No source claims are shown.';
    root.replaceChildren(el('p','Try again online. The directory does not use cached authority records.'));
    root.setAttribute('aria-busy','false');
  }
  async function load() {
    const token=++generation;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),10000);
    try {
      const response=await fetch('/api/news/discovery',{cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
      if (!response.ok || response.headers.has('X-GlobalDeets-Offline-Copy')) throw Error('unavailable');
      const next=await response.json();
      if (token!==generation) return;
      if (navigator.onLine===false || !valid(next)) throw Error('invalid');
      data=next;
      const configured=new Map();
      next.entries.filter(entry=>entry.status==='monitored').forEach(entry=>configured.set(entry.languages[0],(configured.get(entry.languages[0])||0)+1));
      byId('discovery-monitored').textContent=String(next.counts.monitored);
      byId('discovery-feed-languages').textContent=String(next.feedLanguages.length);
      byId('discovery-research').textContent=String(next.counts.research);
      byId('discovery-direct').textContent=String(next.counts.linkOnly);
      byId('discovery-gap').textContent='Configured feed languages: '+[...configured].sort((a,b)=>b[1]-a[1]).map(([lang,n])=>langName(lang)+' '+n).join(' · ')+'. Website languages below are not additional feeds.';
      byId('discovery-review').textContent='Navigation-link research reviewed '+next.reviewedAt+'. Rights and feed health remain separate.';
      const codes=[...new Set(next.entries.flatMap(entry=>entry.languages))].sort((a,b)=>langName(a).localeCompare(langName(b)));
      language.replaceChildren(el('option','All languages'),el('option','Not in configured feeds'));
      language.options[0].value='all';language.options[1].value='unrepresented';
      for(const code of codes){const option=el('option',langName(code));option.value=code;language.append(option);}
      const params=new URLSearchParams(location.search);
      region.value=REGIONS.has(params.get('region'))?params.get('region'):'all';
      language.value=['unrepresented',...codes].includes(params.get('lang'))?params.get('lang'):'all';
      filter.value=['all',...STATUS].includes(params.get('status'))?params.get('status'):'additional';
      controls.forEach(control=>{control.disabled=false;});
      render();
    } catch { if(token===generation) unavailable(); }
    finally {clearTimeout(timer);}
  }
  search.addEventListener('input',render);
  [region,language,filter].forEach(control=>control.addEventListener('change',sync));
  clear.addEventListener('click',()=>{search.value='';region.value='all';language.value='all';filter.value='additional';sync();search.focus();});
  window.addEventListener('offline',()=>{generation++;unavailable();});
  window.addEventListener('online',load);
  load();
})();
