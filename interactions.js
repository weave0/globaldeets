// Accessibility & Interaction helpers (focus trap, theme, view toggle, scroll, toast)
(function(){
    const themeToggle = document.getElementById('themeToggle');
    const gridViewBtn = document.getElementById('gridView');
    const listViewBtn = document.getElementById('listView');
    const scrollToTopBtn = document.getElementById('scrollToTop');
    const toast = document.getElementById('toast');

    let currentTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    function toggleTheme(){ currentTheme = currentTheme === 'dark' ? 'light':'dark'; document.documentElement.setAttribute('data-theme', currentTheme); localStorage.setItem('theme', currentTheme); showToast(`Switched to ${currentTheme} mode`, 'success'); }

    function setView(view){
        const projectsGrid = document.getElementById('projectsGrid');
        if(view==='grid'){projectsGrid.classList.remove('list-view');gridViewBtn.classList.add('active');listViewBtn.classList.remove('active');}
        else {projectsGrid.classList.add('list-view');listViewBtn.classList.add('active');gridViewBtn.classList.remove('active');}
    }

    function scrollToTop(){window.scrollTo({top:0,behavior:'smooth'});}    

    function showToast(message,type='info'){toast.textContent=message;toast.className=`toast ${type} show`;setTimeout(()=>toast.classList.remove('show'),3000);}    

    // Focus Trap
    let previousFocusedElement = null; let trapContainer = null; let focusableEls = []; let firstEl=null; let lastEl=null;
    function activateFocusTrap(container){
        trapContainer = container; previousFocusedElement = document.activeElement;
        focusableEls = Array.from(container.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'));
        if(!focusableEls.length){focusableEls = [container.querySelector('.close')].filter(Boolean);}    
        firstEl = focusableEls[0]; lastEl = focusableEls[focusableEls.length-1];
        if(firstEl) firstEl.focus();
        document.addEventListener('keydown', trapKeyHandler);
    }
    function trapKeyHandler(e){
        if(e.key==='Tab' && trapContainer){
            if(e.shiftKey){ if(document.activeElement===firstEl){ e.preventDefault(); lastEl.focus(); } }
            else { if(document.activeElement===lastEl){ e.preventDefault(); firstEl.focus(); } }
        }
        if(e.key==='Escape' && trapContainer){ deactivateFocusTrap(); trapContainer.style.display='none'; }
    }
    function deactivateFocusTrap(){ document.removeEventListener('keydown', trapKeyHandler); if(previousFocusedElement) previousFocusedElement.focus(); trapContainer=null; }

    // Scroll button visibility
    window.addEventListener('scroll', ()=> { if(window.scrollY>300){scrollToTopBtn.classList.add('visible');} else {scrollToTopBtn.classList.remove('visible');} });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
        if((e.ctrlKey||e.metaKey) && e.key==='k'){ e.preventDefault(); const searchInput=document.getElementById('searchInput'); if(searchInput) searchInput.focus(); }
        if((e.ctrlKey||e.metaKey) && e.key==='t'){ e.preventDefault(); toggleTheme(); }
    });

    // Attach basic listeners if elements exist
    if(themeToggle) themeToggle.addEventListener('click', toggleTheme);
    if(gridViewBtn) gridViewBtn.addEventListener('click', ()=> setView('grid'));
    if(listViewBtn) listViewBtn.addEventListener('click', ()=> setView('list'));
    if(scrollToTopBtn) scrollToTopBtn.addEventListener('click', scrollToTop);

    // Keyboard navigation for icon nav groups (.nav-icon-btn)
    const iconNavButtons = Array.from(document.querySelectorAll('.nav-icon-btn'));
    function focusByOffset(current, offset){
        const idx = iconNavButtons.indexOf(current); if(idx===-1) return; const next=(idx+offset+iconNavButtons.length)%iconNavButtons.length; iconNavButtons[next].focus(); }
    iconNavButtons.forEach(btn=>{
        btn.setAttribute('tabindex','0');
        btn.addEventListener('keydown', e => {
            if(['ArrowRight','ArrowDown'].includes(e.key)){ e.preventDefault(); focusByOffset(btn,1); }
            if(['ArrowLeft','ArrowUp'].includes(e.key)){ e.preventDefault(); focusByOffset(btn,-1); }
            if(e.key==='Enter' || e.key===' '){ e.preventDefault(); btn.click(); }
        });
    });

    // Expose nav focus helper
    window.focusIconNav = (index)=>{ if(iconNavButtons[index]) iconNavButtons[index].focus(); };

    window.activateFocusTrap = activateFocusTrap;
    window.deactivateFocusTrap = deactivateFocusTrap;
    window.toggleTheme = toggleTheme;
    window.setView = setView;
    window.showToast = showToast;
})();
