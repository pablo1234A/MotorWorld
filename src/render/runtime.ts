/**
 * Runtime shipped with every generated site (vanilla JS, ~10 KB, no dependencies).
 * GSAP and Three.js are only loaded when a page actually uses cinematic scroll or a 3D scene,
 * and they are served from the site itself (no third-party CDN).
 */
export const RUNTIME_JS = String.raw`(function(){
"use strict";
var C=window.__WB||{};var d=document;var root=d.documentElement;root.classList.remove("wb-js-off");
var reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
var editing=C.mode==="edit";
function $(s,el){return (el||d).querySelector(s)}function $$(s,el){return Array.prototype.slice.call((el||d).querySelectorAll(s))}

/* ── Navigation ── */
function initNav(){
  $$(".wb-nav").forEach(function(nav){
    var onScroll=function(){nav.classList.toggle("is-scrolled",window.scrollY>8)};onScroll();
    window.addEventListener("scroll",onScroll,{passive:true});
    var b=$("[data-wb-burger]",nav);if(!b||b.__wb)return;b.__wb=1;
    var close=function(){nav.classList.remove("is-open");b.setAttribute("aria-expanded","false")};
    b.addEventListener("click",function(){var o=nav.classList.toggle("is-open");b.setAttribute("aria-expanded",o?"true":"false")});
    $$(".wb-links a",nav).forEach(function(a){a.addEventListener("click",close)});
    d.addEventListener("keydown",function(e){if(e.key==="Escape")close()});
  });
}

/* ── Entrances ── */
var io=null;
function initReveal(){
  var els=$$(".wb-anim,[data-wb-stagger] .wb-stagger");
  $$("[data-wb-stagger] .wb-stagger").forEach(function(g){$$(":scope>*",g).forEach(function(c,i){c.style.transitionDelay=Math.min(i,8)*70+"ms"})});
  if(reduce||!("IntersectionObserver" in window)){els.forEach(function(e){e.classList.add("is-in")});return}
  if(io)io.disconnect();
  io=new IntersectionObserver(function(entries){entries.forEach(function(en){if(en.isIntersecting){en.target.classList.add("is-in");io.unobserve(en.target);countIn(en.target)}})},{rootMargin:"0px 0px -8% 0px",threshold:.08});
  els.forEach(function(e){if(!e.classList.contains("is-in"))io.observe(e)});
  // Above-the-fold content must never wait for scroll.
  requestAnimationFrame(function(){els.forEach(function(e){var r=e.getBoundingClientRect();if(r.top<innerHeight*.95){e.classList.add("is-in");countIn(e)}})});
}

/* ── Counters ── */
function countIn(scope){
  if(reduce)return;
  $$("[data-wb-count]",scope.closest?scope.closest(".wb-s")||scope:scope).forEach(function(el){
    if(el.__wb)return;el.__wb=1;var target=parseFloat(el.getAttribute("data-wb-count"));if(!isFinite(target))return;
    var txt=el.textContent;var m=txt.match(/[\d.,]+/);if(!m)return;var pre=txt.slice(0,m.index),post=txt.slice(m.index+m[0].length);
    var fmt=new Intl.NumberFormat(C.lang||"es");var t0=performance.now(),dur=1100;
    (function tick(t){var p=Math.min(1,(t-t0)/dur);var e=1-Math.pow(1-p,3);el.textContent=pre+fmt.format(Math.round(target*e))+post;if(p<1)requestAnimationFrame(tick);else el.textContent=txt})(t0);
  });
}

/* ── Scroll-linked (rail progress, parallax) ── */
function initScrollFx(){
  var rails=$$("[data-wb-progress]"),par=$$("[data-wb-parallax] .wb-media");
  if(!rails.length&&!par.length)return;
  var ticking=false;
  function update(){ticking=false;var vh=innerHeight;
    rails.forEach(function(r){var b=r.getBoundingClientRect();var p=Math.min(1,Math.max(0,(vh*.7-b.top)/b.height));r.style.setProperty("--progress",p.toFixed(3))});
    if(!reduce)par.forEach(function(m){var b=m.getBoundingClientRect();var c=(b.top+b.height/2-vh/2)/vh;m.style.setProperty("--parallax",(c*-40).toFixed(1)+"px");m.style.transform="translateY(var(--parallax))"});
  }
  window.addEventListener("scroll",function(){if(!ticking){ticking=true;requestAnimationFrame(update)}},{passive:true});update();
}

/* ── Cinematic scroll (GSAP, loaded on demand) ── */
function loadScript(src){return new Promise(function(res,rej){var s=d.createElement("script");s.src=src;s.async=true;s.onload=res;s.onerror=rej;d.head.appendChild(s)})}
function initCinematic(){
  var els=$$("[data-wb-cinematic]");if(!els.length||reduce||editing||!C.gsap)return;
  loadScript(C.gsap).then(function(){return loadScript(C.scrollTrigger)}).then(function(){
    var g=window.gsap;g.registerPlugin(window.ScrollTrigger);
    els.forEach(function(sec){
      var inner=$(".wb-c",sec);if(!inner)return;inner.classList.add("is-in");
      g.fromTo(inner,{y:80,opacity:0,scale:.96},{y:0,opacity:1,scale:1,ease:"none",scrollTrigger:{trigger:sec,start:"top 90%",end:"top 35%",scrub:.6}});
      var media=$(".wb-media",sec);if(media)g.fromTo(media,{clipPath:"inset(12% 12% 12% 12% round 24px)"},{clipPath:"inset(0% 0% 0% 0% round 0px)",ease:"none",scrollTrigger:{trigger:sec,start:"top 85%",end:"center 55%",scrub:.6}});
      var h=$(".wb-h",sec);if(h)g.fromTo(h,{letterSpacing:"0.04em"},{letterSpacing:"-0.02em",ease:"none",scrollTrigger:{trigger:sec,start:"top 85%",end:"top 30%",scrub:.6}});
    });
  }).catch(function(){els.forEach(function(s){var i=$(".wb-c",s);if(i)i.classList.add("is-in")})});
}

/* ── Inventory filters ── */
function initFilters(){
  $$(".wb-filters").forEach(function(group){
    var sec=group.closest(".wb-s");
    $$("[data-wb-filter]",group).forEach(function(btn){btn.addEventListener("click",function(){
      var v=btn.getAttribute("data-wb-filter");
      $$("[data-wb-filter]",group).forEach(function(b){b.setAttribute("aria-pressed",b===btn?"true":"false")});
      $$("[data-wb-tag]",sec).forEach(function(card){card.hidden=!(v==="*"||card.getAttribute("data-wb-tag")===v)});
    })});
  });
}

/* ── Cart ── */
var KEY="wb-cart-"+(C.projectId||"site");
function readCart(){try{return JSON.parse(localStorage.getItem(KEY)||"[]")}catch(e){return []}}
function writeCart(c){try{localStorage.setItem(KEY,JSON.stringify(c))}catch(e){}renderCart()}
function money(n){try{return new Intl.NumberFormat(C.lang||"es",{style:"currency",currency:C.currency||"EUR"}).format(n)}catch(e){return n.toFixed(2)}}
function ensureDrawer(){
  var el=$("#wb-cart");if(el)return el;
  el=d.createElement("div");el.id="wb-cart";el.className="wb-cart";el.setAttribute("role","dialog");el.setAttribute("aria-modal","true");el.setAttribute("aria-label","Carrito");
  el.innerHTML='<div class="wb-cart-scrim" data-wb-cart-close></div><div class="wb-cart-panel"><div class="wb-cart-head"><strong>Tu carrito</strong><button class="wb-icon-btn" type="button" data-wb-cart-close aria-label="Cerrar">✕</button></div><div class="wb-cart-items" data-wb-cart-items></div><div class="wb-cart-foot"><div class="wb-cart-total"><span>Total</span><span data-wb-cart-total></span></div><button class="wb-btn wb-btn-primary" type="button" data-wb-checkout style="--c-btn:var(--wb-primary);--c-on-btn:var(--wb-on-primary)">Finalizar compra</button><p class="wb-cart-note" data-wb-cart-note>Pago seguro procesado por Stripe.</p></div></div>';
  d.body.appendChild(el);
  $$("[data-wb-cart-close]",el).forEach(function(b){b.addEventListener("click",closeCart)});
  d.addEventListener("keydown",function(e){if(e.key==="Escape")closeCart()});
  $("[data-wb-checkout]",el).addEventListener("click",checkout);
  return el;
}
var lastFocus=null;
function openCart(){var el=ensureDrawer();renderCart();lastFocus=d.activeElement;el.classList.add("is-open");var f=$("[data-wb-cart-close].wb-icon-btn",el);if(f)f.focus()}
function closeCart(){var el=$("#wb-cart");if(el&&el.classList.contains("is-open")){el.classList.remove("is-open");if(lastFocus)lastFocus.focus()}}
function renderCart(){
  var c=readCart();var count=c.reduce(function(a,i){return a+i.qty},0);
  $$("[data-wb-cart-count]").forEach(function(b){b.textContent=count;b.hidden=!count});
  var el=$("#wb-cart");if(!el)return;var list=$("[data-wb-cart-items]",el);
  list.innerHTML=c.length?"":'<p style="color:var(--wb-muted)">Tu carrito está vacío.</p>';
  c.forEach(function(i,idx){var row=d.createElement("div");row.className="wb-cart-line";
    row.innerHTML='<strong></strong><span></span><div class="wb-qty"><button type="button" aria-label="Quitar uno">−</button><span style="min-width:1.5rem;text-align:center"></span><button type="button" aria-label="Añadir uno">+</button></div>';
    row.children[0].textContent=i.name;row.children[1].textContent=money(i.price*i.qty);row.children[2].children[1].textContent=i.qty;
    row.children[2].children[0].onclick=function(){var cc=readCart();cc[idx].qty--;if(cc[idx].qty<=0)cc.splice(idx,1);writeCart(cc)};
    row.children[2].children[2].onclick=function(){var cc=readCart();cc[idx].qty=Math.min(99,cc[idx].qty+1);writeCart(cc)};
    list.appendChild(row)});
  $("[data-wb-cart-total]",el).textContent=money(c.reduce(function(a,i){return a+i.price*i.qty},0));
  $("[data-wb-checkout]",el).disabled=!c.length;
}
function checkout(){
  var c=readCart();if(!c.length)return;var note=$("[data-wb-cart-note]");
  if(editing){note.textContent="El pago se activa en el sitio publicado.";return}
  if(c.length===1&&c[0].link){location.href=c[0].link;return}
  if(!C.checkoutAction){note.textContent="Pagos aún no configurados: añade enlaces de pago de Stripe a los productos o configura Stripe en el servidor.";return}
  var btn=$("[data-wb-checkout]");btn.disabled=true;note.textContent="Redirigiendo al pago seguro…";
  fetch(C.checkoutAction,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:c.map(function(i){return {id:i.id,qty:i.qty}}),returnUrl:location.href})})
    .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||"Error");return j})})
    .then(function(j){location.href=j.url})
    .catch(function(e){note.textContent=e.message||"No se pudo iniciar el pago.";btn.disabled=false});
}
function initCart(){
  $$("[data-wb-add]").forEach(function(b){if(b.__wb)return;b.__wb=1;b.addEventListener("click",function(){
    var price=parseFloat(b.getAttribute("data-price"));if(!isFinite(price))return;
    var c=readCart();var id=b.getAttribute("data-id");var f=c.filter(function(i){return i.id===id})[0];
    if(f)f.qty=Math.min(99,f.qty+1);else c.push({id:id,name:b.getAttribute("data-name"),price:price,qty:1,link:b.getAttribute("data-link")||null});
    writeCart(c);var old=b.innerHTML;b.textContent="Añadido ✓";setTimeout(function(){b.innerHTML=old},1200);openCart();
  })});
  $$("[data-wb-cart-open]").forEach(function(b){if(b.__wb)return;b.__wb=1;b.addEventListener("click",openCart)});
  renderCart();
}

/* ── Forms ── */
function initForms(){
  $$("form[data-wb-form]").forEach(function(form){if(form.__wb)return;form.__wb=1;
    form.addEventListener("submit",function(e){e.preventDefault();
      var msg=$(".wb-form-msg",form);msg.className="wb-form-msg";var ok=true;
      $$("[required]",form).forEach(function(f){var bad=f.type==="checkbox"?!f.checked:!String(f.value).trim()||(f.type==="email"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value));f.setAttribute("aria-invalid",bad?"true":"false");if(bad&&ok){ok=false;f.focus()}});
      if(!ok){msg.textContent="Revisa los campos marcados.";msg.classList.add("is-err");return}
      if(editing){msg.textContent="Vista previa: el formulario se enviará en el sitio publicado.";msg.classList.add("is-ok");return}
      if(!form.getAttribute("action")){msg.textContent="Este formulario aún no tiene destino configurado.";msg.classList.add("is-err");return}
      var btn=$("button[type=submit]",form);btn.disabled=true;
      var data={};new FormData(form).forEach(function(v,k){data[k]=v});
      fetch(form.action,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(data)})
        .then(function(r){return r.json().catch(function(){return {}}).then(function(j){if(!r.ok)throw new Error(j.error||"No se pudo enviar");return j})})
        .then(function(){form.reset();msg.textContent=msg.getAttribute("data-ok");msg.classList.add("is-ok")})
        .catch(function(err){msg.textContent=err.message;msg.classList.add("is-err")})
        .finally(function(){btn.disabled=false});
    });
  });
}

/* ── 3D scenes (Three.js, loaded on demand) ── */
var VERT="uniform float uTime;uniform float uAmp;uniform vec2 uMouse;varying vec3 vN;varying vec3 vV;varying float vD;"+
"float w(vec3 p){return sin(p.x*1.9+uTime*.9)*sin(p.y*2.3+uTime*1.1)*sin(p.z*1.7+uTime*.7);}"+
"void main(){vec3 p=position;float dsp=w(p+vec3(uMouse,0.)*.6)*uAmp;p+=normal*dsp;vD=dsp;vec4 mv=modelViewMatrix*vec4(p,1.);vV=-mv.xyz;vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*mv;}";
var FRAG="uniform vec3 uA;uniform vec3 uB;uniform vec3 uC;varying vec3 vN;varying vec3 vV;varying float vD;"+
"void main(){vec3 n=normalize(vN);vec3 v=normalize(vV);float f=pow(1.-max(dot(n,v),0.),2.2);vec3 col=mix(uA,uB,smoothstep(-.3,.3,vD+n.y*.4));col=mix(col,uC,f*.85);col+=f*.25;gl_FragColor=vec4(col,1.);}";
function hexToVec(T,h){var c=new T.Color(h);return new T.Vector3(c.r,c.g,c.b)}
function initScenes(){
  var canvases=$$("canvas[data-wb-scene]");if(!canvases.length)return;
  canvases.forEach(function(cv){
    if(cv.__wb)return;cv.__wb=1;
    var url=cv.getAttribute("data-three");
    import(url).then(function(T){
      var gl;try{gl=new T.WebGLRenderer({canvas:cv,antialias:true,alpha:true,powerPreference:"high-performance"})}catch(e){return}
      var fb=cv.parentNode.querySelector(".wb-scene-fallback");if(fb)fb.style.opacity=".35";
      gl.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
      var scene=new T.Scene();var cam=new T.PerspectiveCamera(35,1,.1,100);cam.position.set(0,0,6.5);
      var cs=getComputedStyle(root);var P=cs.getPropertyValue("--wb-primary").trim()||"#6d5dfc",A=cs.getPropertyValue("--wb-accent").trim()||"#24c6dc",B=cs.getPropertyValue("--wb-bg").trim()||"#0b0b0f";
      var uniforms={uTime:{value:0},uAmp:{value:.28},uMouse:{value:new T.Vector2()},uA:{value:hexToVec(T,B)},uB:{value:hexToVec(T,P)},uC:{value:hexToVec(T,A)}};
      var kind=cv.getAttribute("data-wb-scene");var obj;
      if(kind==="particles"){
        var n=innerWidth<720?2500:6000;var pos=new Float32Array(n*3);for(var i=0;i<n;i++){var r=1.6+Math.random()*1.6,t=Math.random()*Math.PI*2,u=Math.acos(2*Math.random()-1);pos[i*3]=r*Math.sin(u)*Math.cos(t);pos[i*3+1]=r*Math.sin(u)*Math.sin(t)*.6;pos[i*3+2]=r*Math.cos(u)}
        var g=new T.BufferGeometry();g.setAttribute("position",new T.BufferAttribute(pos,3));
        obj=new T.Points(g,new T.PointsMaterial({size:.022,color:new T.Color(P),transparent:true,opacity:.9,depthWrite:false,blending:T.AdditiveBlending}));
      }else{
        var geo=kind==="knot"?new T.TorusKnotGeometry(1.05,.36,320,48):new T.IcosahedronGeometry(1.45,72);
        if(kind==="knot")uniforms.uAmp.value=.08;
        obj=new T.Mesh(geo,new T.ShaderMaterial({uniforms:uniforms,vertexShader:VERT,fragmentShader:FRAG}));
      }
      scene.add(obj);
      var target={x:0,y:0},cur={x:0,y:0},visible=true,running=false;
      function size(){var w=cv.clientWidth,h=cv.clientHeight;if(!w||!h)return;gl.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();obj.position.x=w>860?1.7:0;obj.position.y=w>860?0:-.9;obj.scale.setScalar(w>860?.82:.62)}
      size();window.addEventListener("resize",size);
      cv.parentNode.addEventListener("pointermove",function(e){var r=cv.getBoundingClientRect();target.x=((e.clientX-r.left)/r.width-.5)*2;target.y=((e.clientY-r.top)/r.height-.5)*-2},{passive:true});
      var t0=performance.now();
      function frame(t){if(!visible){running=false;return}running=true;var s=(t-t0)/1000;
        cur.x+=(target.x-cur.x)*.06;cur.y+=(target.y-cur.y)*.06;uniforms.uTime.value=reduce?0:s;uniforms.uMouse.value.set(cur.x,cur.y);
        obj.rotation.y=(reduce?0:s*.15)+cur.x*.5;obj.rotation.x=cur.y*.35;
        gl.render(scene,cam);if(!reduce)requestAnimationFrame(frame);else running=false}
      if("IntersectionObserver" in window)new IntersectionObserver(function(es){visible=es[0].isIntersecting;if(visible&&!running)requestAnimationFrame(frame)}).observe(cv);
      requestAnimationFrame(frame);
    }).catch(function(){/* keep CSS fallback */});
  });
}

/* ── Chart draw-in ── */
function initCharts(){if(reduce)return;$$("path[data-wb-draw]").forEach(function(p){p.style.strokeDasharray="1";p.style.strokeDashoffset="1";p.style.transition="stroke-dashoffset 1.4s cubic-bezier(.65,0,.35,1)";var o=new IntersectionObserver(function(es){if(es[0].isIntersecting){p.style.strokeDashoffset="0";o.disconnect()}});o.observe(p)})}

window.addEventListener("beforeprint",function(){$$(".wb-anim,.wb-stagger").forEach(function(e){e.classList.add("is-in")})});
function init(){initNav();initReveal();initScrollFx();initCinematic();initFilters();initCart();initForms();initScenes();initCharts()}
window.__wbInit=init;
if(d.readyState==="loading")d.addEventListener("DOMContentLoaded",init);else init();
})();`;
