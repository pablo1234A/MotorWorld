/* Aquiles · escultura 3D de la columna vertebral
   WebGL puro (sin librerías). Se renderiza sólo cuando hace falta:
   - escritorio: reacciona levemente al cursor y al scroll, y se detiene al quedarse quieto;
   - móvil: sigue el scroll con un giro mínimo;
   - prefers-reduced-motion o sin WebGL: imagen estática / ilustración SVG. */
(() => {
  'use strict';
  const host = document.getElementById('spine');
  if (!host) return;
  const canvas = host.querySelector('canvas');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hint = host.querySelector('.spine__hint');
  if (hint && !finePointer) hint.textContent = reduce ? 'Modelo 3D' : 'Desliza para girar';

  let gl;
  try { gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' }); } catch (e) { gl = null; }
  if (!gl) return; // se queda la ilustración SVG

  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `
precision highp float;
uniform vec2 uRes; uniform vec2 uRot; uniform vec3 uTint; uniform vec3 uBone;
#define N 11
const float SP = 0.30;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float sdRCyl(vec3 p,float r,float h,float rr){vec2 d=vec2(length(p.xz)-r+rr,abs(p.y)-h+rr);return min(max(d.x,d.y),0.)+length(max(d,0.))-rr;}
float sdCap(vec3 p,vec3 a,vec3 b,float r){vec3 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h)-r;}
float sdTorus(vec3 p,vec2 t){vec2 q=vec2(length(p.xz)-t.x,p.y);return length(q)-t.y;}
vec3 cen(float y){return vec3(0.,y,.17*sin(y*1.9+.35));}
float tilt(float y){return -.32*cos(y*1.9+.35);}
float scl(float i){return mix(1.06,.80,i/float(N-1));}
float vert(vec3 q,float s){
  q/=s;
  vec3 b=q; b.x*=.9;
  float body=sdRCyl(b,.27,.095,.045);
  vec3 m=q; m.x=abs(m.x);
  float ped=sdCap(m,vec3(.1,0.,-.17),vec3(.09,0.,-.3),.042);
  float arch=sdTorus(q-vec3(0.,0.,-.34),vec2(.12,.04));
  float tr=sdCap(m,vec3(.1,.02,-.32),vec3(.41,.06,-.38),.038);
  float sp=sdCap(q,vec3(0.,0.,-.44),vec3(0.,-.13,-.68),.042);
  float d=smin(body,ped,.05);
  d=smin(d,arch,.035); d=smin(d,tr,.035); d=smin(d,sp,.035);
  return d*s;
}
float disc(vec3 q,float s){q/=s;return sdRCyl(q,.235,.04,.035)*s;}
float placed(vec3 p,float i,out float isDisc){
  float y0=-float(N-1)*.5*SP;
  float y=y0+i*SP; vec3 q=p-cen(y); q.yz=rot(tilt(y))*q.yz;
  float d=vert(q,scl(i)); isDisc=0.;
  return d;
}
vec2 map(vec3 p){
  float y0=-float(N-1)*.5*SP;
  float f=(p.y-y0)/SP;
  float i0=clamp(floor(f+.5),0.,float(N-1));
  float i1=clamp(i0+(f>i0?1.:-1.),0.,float(N-1));
  float dd;
  float a=placed(p,i0,dd), b=placed(p,i1,dd);
  float best=min(a,b), mat=0.;
  float lo=min(i0,i1);
  if(i0!=i1){
    float y=y0+(lo+.5)*SP; vec3 q=p-cen(y); q.yz=rot(tilt(y))*q.yz;
    float dk=disc(q,scl(lo+.5));
    if(dk<best){best=dk;mat=1.;}
  }
  return vec2(best,mat);
}
vec3 nrm(vec3 p){const vec2 k=vec2(1.,-1.);float e=.0015;
  return normalize(k.xyy*map(p+k.xyy*e).x+k.yyx*map(p+k.yyx*e).x+k.yxy*map(p+k.yxy*e).x+k.xxx*map(p+k.xxx*e).x);}
vec3 toModel(vec3 v){v.yz=rot(uRot.y)*v.yz; v.xz=rot(uRot.x)*v.xz; return v;}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;
  vec3 ro=toModel(vec3(0.,0.,4.6));
  vec3 rd=toModel(normalize(vec3(uv,-1.25)));
  // caja envolvente: |x|<.75 |y|<1.75 |z|<1.05
  vec3 bmin=vec3(-.75,-1.75,-1.05), bmax=vec3(.75,1.75,1.05);
  vec3 inv=1./rd; vec3 t0=(bmin-ro)*inv, t1=(bmax-ro)*inv;
  vec3 tn=min(t0,t1), tf=max(t0,t1);
  float tmin=max(max(tn.x,tn.y),tn.z), tmax=min(min(tf.x,tf.y),tf.z);
  if(tmax<max(tmin,0.)){gl_FragColor=vec4(0.);return;}
  float t=max(tmin,0.); vec2 h=vec2(1.,0.); bool hit=false;
  for(int i=0;i<72;i++){
    h=map(ro+rd*t);
    if(h.x<.0012*t){hit=true;break;}
    t+=h.x*.9;
    if(t>tmax)break;
  }
  if(!hit){gl_FragColor=vec4(0.);return;}
  vec3 p=ro+rd*t, n=nrm(p), v=-rd;
  vec3 l=normalize(toModel(vec3(-.55,.75,.6)));
  vec3 l2=normalize(toModel(vec3(.8,-.1,-.4)));
  float wrap=clamp(dot(n,l)*.55+.45,0.,1.);
  float back=clamp(dot(n,l2)*.5+.5,0.,1.);
  float fres=pow(1.-clamp(dot(n,v),0.,1.),2.6);
  float spec=pow(clamp(dot(reflect(-l,n),v),0.,1.),28.);
  float ao=clamp(map(p+n*.05).x/.05,0.,1.)*.5+.5;
  ao*=clamp(map(p+n*.14).x/.14,0.,1.)*.4+.6;
  float thick=clamp(map(p-n*.07).x/-.07,0.,1.);
  vec3 base=mix(uBone,mix(uBone,uTint,.55),h.y);
  vec3 col=base*(.42+.58*wrap)*ao;
  col+=uTint*back*.12;
  col+=mix(vec3(1.),uTint,.35)*fres*.55;
  col+=(1.-thick)*vec3(1.,.97,.9)*.08;
  col+=spec*.35;
  float a=clamp(.82+fres*.3,0.,1.);
  gl_FragColor=vec4(col*a,a);
}`;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VS);
  const fs = compile(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uRot = gl.getUniformLocation(prog, 'uRot');
  const uTint = gl.getUniformLocation(prog, 'uTint');
  const uBone = gl.getUniformLocation(prog, 'uBone');

  // Colores desde los tokens del tema (claro/oscuro)
  const readColor = (name, fallback) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name}, ${fallback})`;
    host.appendChild(probe);
    const m = getComputedStyle(probe).color.match(/[\d.]+/g) || [];
    probe.remove();
    return m.length >= 3 ? m.slice(0, 3).map((x) => Number(x) / 255) : [0.4, 0.45, 0.3];
  };
  let tint, bone;
  const readTheme = () => {
    tint = readColor('--olive', '#56653f');
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark';
    bone = dark ? [0.86, 0.84, 0.78] : [0.97, 0.95, 0.9];
  };
  readTheme();

  // Estado
  const BASE_YAW = 0.95, BASE_PITCH = -0.06;
  const cur = { x: BASE_YAW, y: BASE_PITCH };
  const tgt = { x: BASE_YAW, y: BASE_PITCH };
  let mouse = { x: 0, y: 0 }, scrollK = 0, raf = 0, visible = false, drawn = false;

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    // Resolución contenida: nítida pero ligera
    const maxPx = finePointer ? 520000 : 260000;
    let dpr = Math.min(window.devicePixelRatio || 1, finePointer ? 1.6 : 1.25);
    while (r.width * r.height * dpr * dpr > maxPx && dpr > 0.75) dpr -= 0.1;
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  const render = () => {
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform2f(uRot, cur.x, cur.y);
    gl.uniform3f(uTint, tint[0], tint[1], tint[2]);
    gl.uniform3f(uBone, bone[0], bone[1], bone[2]);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!drawn) { drawn = true; host.classList.add('is-live'); }
  };

  const computeTarget = () => {
    tgt.x = BASE_YAW + mouse.x * 0.32 + scrollK * 0.35;
    tgt.y = BASE_PITCH + mouse.y * 0.1;
  };

  const loop = () => {
    raf = 0;
    const k = 0.075;
    cur.x += (tgt.x - cur.x) * k;
    cur.y += (tgt.y - cur.y) * k;
    render();
    if (Math.abs(tgt.x - cur.x) > 0.0008 || Math.abs(tgt.y - cur.y) > 0.0008) raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (!raf && visible) raf = requestAnimationFrame(loop); };

  resize();
  render();
  if (reduce) {
    window.addEventListener('resize', () => { resize(); render(); });
    return;
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) kick(); }, { threshold: 0 }).observe(host);
  } else visible = true;

  if (finePointer) {
    window.addEventListener('pointermove', (e) => {
      if (!visible) return;
      const r = host.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      mouse.x = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth * 0.5)));
      mouse.y = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight * 0.5)));
      computeTarget(); kick();
    }, { passive: true });
  }
  window.addEventListener('scroll', () => {
    if (!visible) return;
    const r = host.getBoundingClientRect();
    const vh = window.innerHeight;
    scrollK = Math.max(-1, Math.min(1, (vh / 2 - (r.top + r.height / 2)) / vh));
    computeTarget(); kick();
  }, { passive: true });

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { resize(); render(); }, 120); });
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener && mq.addEventListener('change', () => { readTheme(); render(); });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); host.classList.remove('is-live'); });
})();
