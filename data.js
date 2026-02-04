// Data & logic for bb-content platform
// Provides market datasets, assessment generator, ROI calculator, charts.
// Lightweight placeholder implementation to activate existing UI elements.

(function(){
  // Market dataset (placeholder)
  const markets = [
    { code:'us', name:'United States', gdp: '27T', english: '95%', languages:['English','Spanish','Chinese'], languageProfile:{English:95, Spanish:13, Chinese:3}, regulatory:['SEC compliance','Insurance state regs'], business:['Mature market','High competition'], capabilities:['Multilingual support','RegTech advisory'] },
    { code:'de', name:'Germany', gdp: '4.5T', english: '65%', languages:['German','English','Turkish'], languageProfile:{German:95, English:65, Turkish:4}, regulatory:['BaFin supervision','GDPR'], business:['Engineering strength','Export focus'], capabilities:['Translation QA','Regulatory mapping'] },
    { code:'jp', name:'Japan', gdp: '4.3T', english: '30%', languages:['Japanese','English','Korean'], languageProfile:{Japanese:98, English:30, Korean:0.5}, regulatory:['FSA insurance','APPI privacy'], business:['High tech adoption','Aging population'], capabilities:['Localization pipeline','Language coverage'] }
  ];

  const languageGapSeverity = {
    us: 2, de: 4, jp: 7
  };

  // Populate selects
  function populateSelect(id){
    const sel = document.getElementById(id); if(!sel) return;
    markets.forEach(m=>{ const opt=document.createElement('option'); opt.value=m.code; opt.textContent=m.name; sel.appendChild(opt); });
  }
  ['expansion-market','market-select','roi-market'].forEach(populateSelect);

  // Critical / high-priority placeholders
  function renderOpportunityLists(){
    const criticalList = document.getElementById('critical-list');
    const highList = document.getElementById('high-list');
    const strategicList = document.getElementById('strategic-list');
    if(!criticalList) return;
    criticalList.innerHTML = markets.filter(m=>languageGapSeverity[m.code]>5).map(m=>`<li>${m.name} – severe language gap</li>`).join('');
    highList.innerHTML = markets.filter(m=>languageGapSeverity[m.code]>3 && languageGapSeverity[m.code]<=5).map(m=>`<li>${m.name} – moderate localization need</li>`).join('');
    strategicList.innerHTML = markets.map(m=>`<li>${m.name} – ${m.business[0]}</li>`).join('');
  }
  renderOpportunityLists();

  // Assessment generation
  const runAssessmentBtn = document.getElementById('run-assessment');
  if(runAssessmentBtn){
    runAssessmentBtn.addEventListener('click', ()=>{
      const industry = document.getElementById('industry').value;
      const marketCode = document.getElementById('expansion-market').value;
      const revenue = parseFloat(document.getElementById('revenue').value||'0');
      const resultsBox = document.getElementById('assessment-results');
      const langReqs = document.getElementById('lang-reqs');
      const regComplexity = document.getElementById('reg-complexity');
      const solution = document.getElementById('solution');
      const investment = document.getElementById('investment');
      if(!marketCode){ if(window.showToast) window.showToast('Select a market','error'); return; }
      const market = markets.find(m=>m.code===marketCode);
      const gap = languageGapSeverity[marketCode];
      langReqs.innerHTML = `<p><strong>Languages:</strong> ${market.languages.join(', ')}</p><p>Gap severity index: ${gap}</p>`;
      regComplexity.innerHTML = market.regulatory.map(r=>`<div>• ${r}</div>`).join('');
      solution.innerHTML = `<p>Deploy multilingual compliance workflows for ${industry||'selected industry'} leveraging specialized adaptive translation layers.</p>`;
      const baseCost = 0.02 * revenue; // placeholder cost logic
      investment.innerHTML = `<p>Estimated Year 1 Service Cost: $${(baseCost).toFixed(2)}M</p><p>Projected Efficiency Gain: ${(gap*5).toFixed(1)}%</p>`;
      resultsBox.classList.remove('hidden');
      if(window.showToast) window.showToast('Assessment generated','success');
    });
  }

  // ROI calculator
  const roiBtn = document.getElementById('calculate-roi');
  if(roiBtn){
    roiBtn.addEventListener('click', ()=>{
      const marketCode = document.getElementById('roi-market').value;
      const expansionType = document.getElementById('expansion-type').value;
      const revenue = parseFloat(document.getElementById('roi-revenue').value||'0');
      const docVolume = parseInt(document.getElementById('doc-volume').value||'0',10);
      if(!marketCode){ if(window.showToast) window.showToast('Select ROI market','error'); return; }
      const roiResults = document.getElementById('roi-results');
      const investmentTotal = document.getElementById('investment-total');
      const roiPercentage = document.getElementById('roi-percentage');
      const payback = document.getElementById('payback');
      const timeSaved = document.getElementById('time-saved');
      const breakdown = document.getElementById('breakdown');
      const gap = languageGapSeverity[marketCode];
      const complexityFactor = expansionType==='new'?1.3: expansionType==='expansion'?1.1:1.2;
      const investment = (docVolume*0.002 + revenue*0.015)*complexityFactor; // placeholder calc
      const gain = revenue * (0.04 + gap/100); // placeholder ROI gain
      const roi = ((gain - investment)/investment)*100;
      const months = Math.max(3, Math.round(investment / (gain/12)));
      investmentTotal.textContent = `$${investment.toFixed(2)}M`;
      roiPercentage.textContent = `${roi.toFixed(1)}%`;
      payback.textContent = `${months} months`;
      timeSaved.textContent = `${Math.round(gap*2)} months`;
      breakdown.innerHTML = `<p><strong>Translation Layer:</strong> $${(investment*0.4).toFixed(2)}M</p><p><strong>Compliance Alignment:</strong> $${(investment*0.35).toFixed(2)}M</p><p><strong>Operational Efficiency:</strong> $${(investment*0.25).toFixed(2)}M</p>`;
      roiResults.classList.remove('hidden');
      if(window.showToast) window.showToast('ROI calculated','success');
      renderRoiChart(gap, investment, gain);
    });
  }

  // Charts with error handling
  function renderMarketChart(){
    const canvas = document.getElementById('marketChart'); 
    if(!canvas) return;
    if(!window.Chart){ console.warn('Chart.js not loaded'); return; }
    try {
      new Chart(canvas,{ type:'bar', data:{ labels: markets.map(m=>m.name), datasets:[{ label:'Language Gap Severity', data: markets.map(m=>languageGapSeverity[m.code]), backgroundColor:'rgba(59,130,246,0.6)'}] }, options:{ responsive:true, plugins:{legend:{labels:{color:'#fff'}}}, scales:{ x:{ticks:{color:'#fff'}}, y:{ticks:{color:'#fff'}} } } });
    } catch(e){ console.error('Chart.js render failed:',e); }
  }
  function renderLangChart(){
    const canvas = document.getElementById('langChart'); 
    if(!canvas) return;
    if(!window.Chart){ console.warn('Chart.js not loaded'); return; }
    const marketCode = document.getElementById('market-select')?.value || 'us';
    const market = markets.find(m=>m.code===marketCode) || markets[0];
    try {
      new Chart(canvas,{ type:'doughnut', data:{ labels:Object.keys(market.languageProfile), datasets:[{ data:Object.values(market.languageProfile), backgroundColor:['#3b82f6','#8b5cf6','#ec4899','#06b6d4'] }] }, options:{ plugins:{legend:{labels:{color:'#fff'}}} } });
    } catch(e){ console.error('Chart.js render failed:',e); }
  }
  function renderRoiChart(gap, investment, gain){
    const canvas = document.getElementById('roiChart'); 
    if(!canvas) return;
    if(!window.Chart){ console.warn('Chart.js not loaded'); return; }
    try {
      new Chart(canvas,{ type:'line', data:{ labels:['Year 1','Year 2','Year 3'], datasets:[{ label:'Projected Gain', data:[gain*0.8, gain*1.2, gain*1.5], borderColor:'#10b981', backgroundColor:'rgba(16,185,129,0.3)' }, { label:'Cumulative Investment', data:[investment, investment*1.05, investment*1.08], borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.3)' }] }, options:{ plugins:{legend:{labels:{color:'#fff'}}}, scales:{ x:{ticks:{color:'#fff'}}, y:{ticks:{color:'#fff'}} } } });
    } catch(e){ console.error('Chart.js render failed:',e); }
  }

  const marketSelect = document.getElementById('market-select');
  if(marketSelect){ marketSelect.addEventListener('change', ()=>{ renderLangChart(); if(window.showToast) window.showToast('Market changed','info'); }); }

  // Initial charts
  renderMarketChart();
  renderLangChart();
})();
