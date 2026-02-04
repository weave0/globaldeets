// UI Effects Module: tilt, particles, ripple, parallax, reveal
(function(){
    function init3DTilt(){
        const cards = document.querySelectorAll('.project-card');
        cards.forEach(card => {
            card.addEventListener('mousemove', e => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = ((y - centerY) / centerY) * -5;
                const rotateY = ((x - centerX) / centerX) * 5;
                card.style.transform = `translateY(-12px) scale(1.02) perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
                card.style.setProperty('--mouse-x', `${(x / rect.width) * 100}%`);
                card.style.setProperty('--mouse-y', `${(y / rect.height) * 100}%`);
            });
            card.addEventListener('mouseleave', () => { card.style.transform=''; });
        });
    }

    class ParticleBackground {
        constructor(){
            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d');
            this.particles = []; this.particleCount = 80; this.mouse={x:0,y:0};
            this.init();
        }
        init(){
            this.canvas.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:0.6;';
            document.body.prepend(this.canvas);
            this.resize(); this.createParticles(); this.animate();
            window.addEventListener('resize',()=>this.resize());
            window.addEventListener('mousemove',e=>{this.mouse.x=e.clientX;this.mouse.y=e.clientY;});
        }
        resize(){this.canvas.width=window.innerWidth;this.canvas.height=window.innerHeight;}
        createParticles(){for(let i=0;i<this.particleCount;i++){this.particles.push({x:Math.random()*this.canvas.width,y:Math.random()*this.canvas.height,size:Math.random()*3+1,speedX:(Math.random()-0.5)*0.5,speedY:(Math.random()-0.5)*0.5,opacity:Math.random()*0.5+0.2,hue:Math.random()*60+200});}}
        drawParticle(p){this.ctx.beginPath();this.ctx.arc(p.x,p.y,p.size,0,Math.PI*2);const g=this.ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.size*2);g.addColorStop(0,`hsla(${p.hue},80%,60%,${p.opacity})`);g.addColorStop(1,`hsla(${p.hue},80%,60%,0)`);this.ctx.fillStyle=g;this.ctx.fill();this.ctx.shadowBlur=20;this.ctx.shadowColor=`hsla(${p.hue},80%,60%,${p.opacity*0.5})`;this.ctx.fill();this.ctx.shadowBlur=0;}
        connectParticles(){for(let i=0;i<this.particles.length;i++){for(let j=i+1;j<this.particles.length;j++){const dx=this.particles[i].x-this.particles[j].x;const dy=this.particles[i].y-this.particles[j].y;const dist=Math.sqrt(dx*dx+dy*dy);if(dist<150){const op=(1-dist/150)*0.15;this.ctx.beginPath();this.ctx.strokeStyle=`rgba(59,130,246,${op})`;this.ctx.lineWidth=0.5;this.ctx.moveTo(this.particles[i].x,this.particles[i].y);this.ctx.lineTo(this.particles[j].x,this.particles[j].y);this.ctx.stroke();}}}}
        update(){this.particles.forEach(p=>{const dx=this.mouse.x-p.x;const dy=this.mouse.y-p.y;const d=Math.sqrt(dx*dx+dy*dy);if(d<150){const f=(150-d)/150;p.x-=(dx/d)*f*2;p.y-=(dy/d)*f*2;}p.x+=p.speedX;p.y+=p.speedY;if(p.x<0||p.x>this.canvas.width)p.speedX*=-1;if(p.y<0||p.y>this.canvas.height)p.speedY*=-1;p.x=Math.max(0,Math.min(this.canvas.width,p.x));p.y=Math.max(0,Math.min(this.canvas.height,p.y));});}
        animate(){this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.update();this.connectParticles();this.particles.forEach(p=>this.drawParticle(p));requestAnimationFrame(()=>this.animate());}
    }

    function createRipple(event){
        const btn=event.currentTarget;const ripple=document.createElement('span');const rect=btn.getBoundingClientRect();const size=Math.max(rect.width,rect.height);const x=event.clientX-rect.left-size/2;const y=event.clientY-rect.top-size/2;ripple.style.width=ripple.style.height=`${size}px`;ripple.style.left=`${x}px`;ripple.style.top=`${y}px`;ripple.classList.add('ripple');btn.style.position='relative';btn.style.overflow='hidden';btn.appendChild(ripple);setTimeout(()=>ripple.remove(),600);
    }
    function initRippleEffects(){
        const elements=document.querySelectorAll('.view-btn,.filter-select,.view-details,button');
        elements.forEach(el=>{el.addEventListener('click',createRipple);el.classList.add('btn-press');});
    }

    class ParallaxController {
        constructor(){this.elements=[];this.ticking=false;this.init();}
        init(){this.addParallaxElement('.logo h1',0.3);this.addParallaxElement('.stats-bar',0.15);this.addParallaxElement('.project-card',0.1);window.addEventListener('scroll',()=>this.requestTick());this.update();}
        addParallaxElement(selector,speed){document.querySelectorAll(selector).forEach(el=>{this.elements.push({element:el,speed,initialY:el.getBoundingClientRect().top+window.pageYOffset});});}
        requestTick(){if(!this.ticking){requestAnimationFrame(()=>this.update());this.ticking=true;}}
        update(){const scrollY=window.pageYOffset;this.elements.forEach(({element,speed,initialY})=>{const rect=element.getBoundingClientRect();const visible=rect.top<window.innerHeight&&rect.bottom>0;if(visible){const offset=(scrollY-initialY)*speed;element.style.transform=`translateY(${offset}px)`;}});this.ticking=false;}
    }

    // Reveal observer
    const revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => { if(entry.isIntersecting){entry.target.style.opacity='1';entry.target.style.transform='translateY(0)';}});
    }, {threshold:0.1, rootMargin:'0px 0px -100px 0px'});
    function observeCards(){const cards=document.querySelectorAll('.project-card');cards.forEach(c=>{c.style.opacity='0';c.style.transform='translateY(30px)';c.style.transition='opacity 0.6s ease, transform 0.6s ease';revealObserver.observe(c);});}

    let particleInstance=null; let parallaxInstance=null;
    function initUiEffects(){init3DTilt();initRippleEffects();observeCards();if(!particleInstance) particleInstance=new ParticleBackground();if(!parallaxInstance) parallaxInstance=new ParallaxController();}

    window.initUiEffects = initUiEffects;
})();
