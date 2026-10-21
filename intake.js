/* Daily intake + barcode scan tab. Uses its own localStorage keys only. */
(function(){
"use strict";
var LOG_KEY="meal-intake-log-v1";   // {days:{"YYYY-MM-DD":[entry,...]}}
var GOAL=1900, KEEP_DAYS=14, SHOW_DAYS=7;
var OFF="https://world.openfoodfacts.org/api/v2/product/";
var FIELDS="product_name,product_name_en,generic_name,brands,image_front_small_url,image_front_url,image_url,nutriments,serving_size,serving_quantity,product_quantity,quantity";
var MEALS={};
var log={days:{}};
var cur=null;          // current product
var mode="serv";
var controls=null, reader=null, scanning=false, busy=false;
var $=function(id){return document.getElementById(id);};

function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function pad(n){return (n<10?"0":"")+n;}
function dayKey(d){d=d||new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function fmt(n){return Math.round(n).toLocaleString("en-AU");}
function load(){try{log=JSON.parse(localStorage.getItem(LOG_KEY))||{days:{}};}catch(e){log={days:{}};}if(!log.days)log.days={};}
function save(){try{localStorage.setItem(LOG_KEY,JSON.stringify(log));}catch(e){}}
function prune(){
  var cut=new Date();cut.setHours(0,0,0,0);cut.setDate(cut.getDate()-(KEEP_DAYS-1));var ck=dayKey(cut);
  Object.keys(log.days).forEach(function(k){if(k<ck||!log.days[k].length)delete log.days[k];});
}
function today(){var k=dayKey();return log.days[k]||[];}
function total(list){return list.reduce(function(s,e){return s+(+e.kcal||0);},0);}
function addEntry(name,kcal,detail){
  kcal=Math.round(+kcal);if(!(kcal>0))return false;
  var k=dayKey();(log.days[k]=log.days[k]||[]).push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:String(name||"Food").slice(0,80),kcal:kcal,detail:detail||"",t:Date.now()});
  prune();save();renderToday();toast("Added "+fmt(kcal)+" cal");return true;
}
function toast(msg){var t=$("ixToast");if(!t)return;t.textContent=msg;t.classList.add("on");clearTimeout(toast._t);toast._t=setTimeout(function(){t.classList.remove("on");},1800);}
function status(msg,kind){var s=$("ixStatus");if(!s)return;s.className="ix-status"+(kind?" "+kind:"");s.textContent=msg||"";s.style.display=msg?"block":"none";}

function html(){
  var meals=Object.keys(MEALS).map(function(k){var m=MEALS[k];
    return '<button class="ix-meal" data-meal="'+k+'"><b>'+esc(m.name)+'</b><small>~'+fmt(m.cal)+' cal</small></button>';}).join("");
  return ''+
  '<div class="card" id="ixToday"></div>'+
  '<div class="card"><h2>Scan a barcode</h2><div class="meta">Point the back camera at the barcode on the pack</div>'+
    '<div class="ix-cam" id="ixCam"><video id="ixVideo" playsinline muted autoplay></video><div class="ix-aim"></div></div>'+
    '<div class="ix-btns"><button class="ix-btn pri" id="ixStart">📷 Start camera scan</button>'+
    '<button class="ix-btn" id="ixStop" style="display:none">Stop camera</button>'+
    '<label class="ix-btn" for="ixFile">🖼️ Take / choose photo</label></div>'+
    '<input type="file" id="ixFile" accept="image/*" capture="environment" hidden>'+
    '<div class="ix-row"><input id="ixCode" inputmode="numeric" pattern="[0-9]*" placeholder="Or type the barcode number" autocomplete="off"><button class="ix-btn sm" id="ixLook">Look up</button></div>'+
    '<div class="ix-status" id="ixStatus" style="display:none"></div>'+
  '</div>'+
  '<div class="card" id="ixProduct" style="display:none"></div>'+
  '<div class="card" id="ixManual"><h2>Add manually</h2><div class="meta" id="ixManualMeta">For anything without a barcode</div>'+
    '<div class="ix-row"><input id="ixMName" placeholder="Food name" autocomplete="off"></div>'+
    '<div class="ix-row"><input id="ixMCal" inputmode="decimal" placeholder="Calories" autocomplete="off"><button class="ix-btn pri sm" id="ixMAdd">Add to today</button></div></div>'+
  '<div class="card"><h2>Add a planned meal</h2><div class="meta">Uses the plan\'s estimates</div><div class="ix-meals">'+meals+'</div></div>'+
  '<div class="card" id="ixLog"></div>'+
  '<div class="card" id="ixHist"></div>'+
  '<div class="ix-toast" id="ixToast"></div>';
}

function renderToday(){
  var list=today(),t=total(list),left=GOAL-t,pct=Math.min(100,t/GOAL*100);
  var d=new Date();
  $("ixToday").innerHTML='<div class="dayhead"><h2>Today</h2><span class="meta">'+d.toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"})+'</span></div>'+
    '<div class="ix-big"><b>'+fmt(t)+'</b> / '+fmt(GOAL)+' cal</div>'+
    '<div class="bar ix-bar'+(t>GOAL?' over':'')+'"><i style="width:'+pct+'%"></i></div>'+
    '<div class="ix-left'+(left<0?' over':'')+'">'+(left>=0?fmt(left)+' cal left':fmt(-left)+' cal over')+'</div>';
  $("ixLog").innerHTML='<h2>Today\'s log</h2>'+(list.length?list.map(function(e){
      return '<div class="ix-entry"><div class="txt">'+esc(e.name)+'<small>'+esc(e.detail?e.detail+' · ':'')+new Date(e.t).toLocaleTimeString("en-AU",{hour:"numeric",minute:"2-digit"})+'</small></div><b>'+fmt(e.kcal)+'</b><button class="ix-del" data-del="'+e.id+'" aria-label="Delete '+esc(e.name)+'">×</button></div>';
    }).join(""):'<div class="meta">Nothing logged yet today</div>');
  renderHist();
}
function renderHist(){
  var h='<h2>Last 7 days</h2>',d=new Date();d.setHours(12,0,0,0);
  for(var i=0;i<SHOW_DAYS;i++){
    var k=dayKey(d),list=log.days[k]||[],t=total(list);
    var label=i===0?"Today":i===1?"Yesterday":d.toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"});
    h+='<details class="ix-day"><summary><span>'+label+'</span><span class="'+(t>GOAL?'over':'')+'">'+(t?fmt(t)+' cal':'—')+'</span></summary>'+
      (list.length?list.map(function(e){return '<div class="ix-entry sm"><div class="txt">'+esc(e.name)+(e.detail?'<small>'+esc(e.detail)+'</small>':'')+'</div><b>'+fmt(e.kcal)+'</b></div>';}).join(""):'<div class="meta">No entries</div>')+'</details>';
    d.setDate(d.getDate()-1);
  }
  $("ixHist").innerHTML=h;
}

/* ---------- product lookup ---------- */
function num(v){v=parseFloat(v);return isFinite(v)&&v>0?v:null;}
function parseProduct(code,p){
  var n=p.nutriments||{};
  var k100=num(n["energy-kcal_100g"]);
  if(!k100){var kj=num(n["energy-kj_100g"])||(n.energy_unit!=="kcal"?num(n.energy_100g):null);if(kj)k100=kj/4.184;}
  var sq=num(p.serving_quantity);
  var kserv=num(n["energy-kcal_serving"]);
  if(!kserv){var kjs=num(n["energy-kj_serving"]);if(kjs)kserv=kjs/4.184;}
  if(!kserv&&k100&&sq)kserv=k100*sq/100;
  return {code:code,name:p.product_name_en||p.product_name||p.generic_name||"",brand:(p.brands||"").split(",")[0].trim(),
    img:p.image_front_small_url||p.image_front_url||p.image_url||"",k100:k100,kserv:kserv,servSize:p.serving_size||"",servG:sq,
    packG:num(p.product_quantity),qty:p.quantity||""};
}
function lookup(code){
  code=String(code||"").replace(/\D/g,"");
  if(code.length<8){status("That barcode looks too short — check the number and try again.","warn");return;}
  if(busy)return;
  hideProduct();
  var nm0=$("ixMName");if(nm0.dataset.prefill){if(nm0.value===nm0.dataset.prefill)nm0.value="";delete nm0.dataset.prefill;}
  if(navigator.onLine===false){status("You're offline. Barcode lookups need internet — connect and try again, or add it manually below.","warn");showManual(null,code);return;}
  busy=true;status("Looking up "+code+"…");
  var ctrl=window.AbortController?new AbortController():null,timer=setTimeout(function(){if(ctrl)ctrl.abort();},12000);
  var variants=[code];
  if(code.length===12)variants.push("0"+code);
  else if(code.length===13&&code.charAt(0)==="0")variants.push(code.slice(1));
  function get(i){
    return fetch(OFF+variants[i]+".json?fields="+FIELDS,{signal:ctrl?ctrl.signal:undefined}).then(function(r){
      if(r.status===404)return {status:0};
      if(!r.ok)throw new Error("HTTP "+r.status);
      return r.json();
    }).then(function(d){return (d&&d.status===1)||i+1>=variants.length?d:get(i+1);});
  }
  get(0).then(function(d){
    clearTimeout(timer);busy=false;
    if(!d||d.status!==1||!d.product){status("Not found in Open Food Facts ("+code+"). Add it manually below.","warn");showManual(null,code);return;}
    var p=parseProduct(code,d.product);
    if(!p.k100&&!p.kserv){status("Found it, but there's no calorie info. Add the calories from the label below.","warn");showManual(p,code);return;}
    status("");showProduct(p);
  }).catch(function(e){
    clearTimeout(timer);busy=false;
    status(navigator.onLine===false?"You're offline. Barcode lookups need internet — try again when connected, or add it manually below.":"Couldn't reach the food database just now. Check your connection and try again, or add it manually below.","warn");
    showManual(null,code);
  });
}
function label(p,def){var n=p.name||"",b=p.brand||"";if(b&&n.toLowerCase().indexOf(b.toLowerCase())>-1)b="";return [b,n].filter(Boolean).join(" ")||(def==null?"Scanned food":def);}
function hideProduct(){var c=$("ixProduct");c.style.display="none";c.innerHTML="";cur=null;}
function showManual(p,code){
  var nm=$("ixMName");nm.value=p?label(p,""):"";if(nm.value)nm.dataset.prefill=nm.value;
  $("ixManualMeta").textContent=code?"Barcode "+code+" — type the name and calories from the label":"For anything without a barcode";
  $("ixManual").scrollIntoView({behavior:"smooth",block:"center"});
  setTimeout(function(){(nm.value?$("ixMCal"):nm).focus();},350);
}
function showProduct(p){
  cur=p;
  mode=p.kserv?"serv":(p.k100?"g":"pack");
  var opts=[];
  if(p.kserv)opts.push(["serv","Servings"]);
  if(p.k100)opts.push(["g","Grams"]);
  if(p.k100&&p.packG)opts.push(["pack","Whole pack"]);
  var c=$("ixProduct");
  c.innerHTML='<div class="ix-prod">'+(p.img?'<img src="'+esc(p.img)+'" alt="" referrerpolicy="no-referrer" onerror="this.remove()">':'')+
    '<div><h2>'+esc(p.name||"Unnamed product")+'</h2><div class="meta">'+esc([p.brand,p.qty].filter(Boolean).join(" · "))+'</div>'+
    '<div class="ix-facts">'+(p.k100?'<span>'+fmt(p.k100)+' cal / 100g</span>':'')+(p.kserv?'<span>'+fmt(p.kserv)+' cal / serving'+(p.servSize?' ('+esc(p.servSize)+')':'')+'</span>':'')+'</div></div></div>'+
    '<h3>How much did you have?</h3><div class="ix-seg">'+opts.map(function(o){return '<button data-mode="'+o[0]+'">'+o[1]+'</button>';}).join("")+'</div>'+
    '<div class="ix-row" id="ixAmtRow"><input id="ixAmt" inputmode="decimal" autocomplete="off"><span class="meta" id="ixUnit"></span></div>'+
    '<div class="ix-calc" id="ixCalc"></div>'+
    '<div class="ix-btns"><button class="ix-btn pri" id="ixAdd">Add to today</button><button class="ix-btn" id="ixCancel">Cancel</button></div>'+
    '<div class="meta ix-src">Data: Open Food Facts · barcode '+esc(p.code)+'</div>';
  c.style.display="block";
  setMode(mode);
  c.scrollIntoView({behavior:"smooth",block:"start"});
}
function setMode(m){
  mode=m;var p=cur;if(!p)return;
  document.querySelectorAll("#ixProduct .ix-seg button").forEach(function(b){b.classList.toggle("on",b.dataset.mode===m);});
  var amt=$("ixAmt"),row=$("ixAmtRow");
  row.style.display=m==="pack"?"none":"flex";
  if(m==="serv"){amt.value="1";$("ixUnit").textContent="serving(s)";}
  else if(m==="g"){amt.value=String(Math.round(p.servG||100));$("ixUnit").textContent="g / ml";}
  calc();
}
function amount(){
  var p=cur;if(!p)return null;var a=parseFloat(String($("ixAmt").value).replace(",","."));
  if(mode==="pack")return {kcal:p.k100*p.packG/100,detail:"whole pack ("+(p.qty||fmt(p.packG)+"g")+")"};
  if(!(a>0))return null;
  if(mode==="serv")return {kcal:p.kserv*a,detail:(+a.toFixed(2))+" serving"+(a===1?"":"s")};
  return {kcal:p.k100*a/100,detail:(+a.toFixed(1))+"g"};
}
function calc(){var r=amount();$("ixCalc").innerHTML=r?'= <b>'+fmt(r.kcal)+' cal</b>':'<span class="meta">Enter an amount</span>';}

/* ---------- scanning ---------- */
function getReader(){
  if(reader)return reader;
  if(!window.ZXingBrowser)throw new Error("Scanner library didn't load");
  var Z=window.ZXingBrowser,F=Z.BarcodeFormat;
  var hints=new Map();
  hints.set(2,[F.EAN_13,F.EAN_8,F.UPC_A,F.UPC_E]); // DecodeHintType.POSSIBLE_FORMATS
  hints.set(3,true);                               // DecodeHintType.TRY_HARDER
  reader=new Z.BrowserMultiFormatReader(hints,{delayBetweenScanAttempts:150,delayBetweenScanSuccess:500});
  return reader;
}
function normalize(text,format){
  text=String(text);
  if(format==="upce"||(window.ZXingBrowser&&format===window.ZXingBrowser.BarcodeFormat.UPC_E&&text.length===8))return window.UPCE.toUPCA(text);
  return text;
}
var upceTimer=null,upceCanvas=null;
function upceLoop(v){
  clearInterval(upceTimer);
  if(!window.UPCE)return;
  upceTimer=setInterval(function(){
    if(!scanning||!v.videoWidth)return;
    var s=Math.min(1,1280/v.videoWidth);upceCanvas=upceCanvas||document.createElement("canvas");
    upceCanvas.width=Math.round(v.videoWidth*s);upceCanvas.height=Math.round(v.videoHeight*s);
    upceCanvas.getContext("2d",{willReadFrequently:true}).drawImage(v,0,0,upceCanvas.width,upceCanvas.height);
    var c=window.UPCE.decodeCanvas(upceCanvas);
    if(c&&scanning){stopScan();if(navigator.vibrate)navigator.vibrate(60);var code=normalize(c,"upce");$("ixCode").value=code;lookup(code);}
  },400);
}
function startScan(){
  if(scanning)return;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){status("This browser can't open the camera here. Use 'Take / choose photo' instead.","warn");return;}
  var r;try{r=getReader();}catch(e){status(e.message+". Try reloading the app.","warn");return;}
  hideProduct();
  var v=$("ixVideo");$("ixCam").classList.add("on");
  $("ixStart").style.display="none";$("ixStop").style.display="";
  status("Starting camera… allow camera access if asked.");
  scanning=true;
  r.decodeFromConstraints({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}}},v,function(res,err,ctl){
    controls=ctl;
    if(res&&scanning){
      stopScan();
      if(navigator.vibrate)navigator.vibrate(60);
      var code=normalize(res.getText(),res.getBarcodeFormat());
      $("ixCode").value=code;lookup(code);
    }
  }).then(function(ctl){controls=ctl;if(!scanning){ctl.stop();return;}upceLoop(v);status("Scanning — hold the barcode inside the box, about 15 cm away.");})
  .catch(function(e){
    scanning=false;stopScan(true);
    var n=e&&e.name;
    status(n==="NotAllowedError"?"Camera access was blocked. Allow it in Settings › Safari › Camera (or tap 'Take / choose photo').":
      n==="NotFoundError"||n==="OverconstrainedError"?"No camera found. Use 'Take / choose photo' instead.":"Couldn't start the camera ("+(e&&e.message||n||"error")+"). Try 'Take / choose photo'.","warn");
  });
}
function stopScan(quiet){
  scanning=false;clearInterval(upceTimer);
  try{if(controls)controls.stop();}catch(e){}
  controls=null;
  var v=$("ixVideo");if(v&&v.srcObject){try{v.srcObject.getTracks().forEach(function(t){t.stop();});}catch(e){}v.srcObject=null;}
  if($("ixCam"))$("ixCam").classList.remove("on");
  if($("ixStart")){$("ixStart").style.display="";$("ixStop").style.display="none";}
  if(quiet!==true&&!busy)status("");
}
function decodePhoto(file){
  if(!file)return;
  var r;try{r=getReader();}catch(e){status(e.message+". Try reloading the app.","warn");return;}
  stopScan(true);hideProduct();status("Reading barcode from photo…");
  var url=URL.createObjectURL(file),img=new Image();
  img.onload=function(){
    var found=null,sizes=[1600,1000,2400,700],W=img.naturalWidth,H=img.naturalHeight;
    for(var i=0;i<sizes.length&&!found;i++){
      for(var rot=0;rot<2&&!found;rot++){
        var s=Math.min(1,sizes[i]/Math.max(W,H)),w=Math.round(W*s),h=Math.round(H*s);
        var cv=document.createElement("canvas"),cx=cv.getContext("2d");
        if(rot){cv.width=h;cv.height=w;cx.translate(h,0);cx.rotate(Math.PI/2);}else{cv.width=w;cv.height=h;}
        cx.drawImage(img,0,0,w,h);
        try{found=r.decodeFromCanvas(cv);}catch(e){}
        if(!found&&window.UPCE){var u=window.UPCE.decodeCanvas(cv);if(u)found={getText:function(){return u;},getBarcodeFormat:function(){return "upce";}};}
      }
    }
    URL.revokeObjectURL(url);
    if(found){var code=normalize(found.getText(),found.getBarcodeFormat());$("ixCode").value=code;lookup(code);}
    else status("Couldn't find a barcode in that photo. Try again closer up, with the barcode flat and in focus — or type the number.","warn");
  };
  img.onerror=function(){URL.revokeObjectURL(url);status("Couldn't open that photo. Try another one.","warn");};
  img.src=url;
}

/* ---------- wiring ---------- */
function bind(){
  var sec=$("scan");
  sec.addEventListener("click",function(e){
    var t=e.target.closest("button");if(!t)return;
    if(t.id==="ixStart")startScan();
    else if(t.id==="ixStop")stopScan();
    else if(t.id==="ixLook")lookup($("ixCode").value);
    else if(t.id==="ixCancel"){hideProduct();status("");}
    else if(t.id==="ixAdd"){var r=amount();if(r&&cur&&addEntry(label(cur),r.kcal,r.detail)){hideProduct();status("");$("ixCode").value="";}}
    else if(t.id==="ixMAdd"){
      var nm=$("ixMName").value.trim()||"Food",cal=parseFloat(String($("ixMCal").value).replace(",","."));
      if(!(cal>0)){$("ixMCal").focus();toast("Enter the calories");return;}
      if(addEntry(nm,cal,"manual")){$("ixMName").value="";$("ixMCal").value="";$("ixManualMeta").textContent="For anything without a barcode";}
    }
    else if(t.dataset.mode)setMode(t.dataset.mode);
    else if(t.dataset.meal){var m=MEALS[t.dataset.meal];if(m)addEntry(m.name,m.cal,"planned meal (est.)");}
    else if(t.dataset.del){
      var k=dayKey();log.days[k]=(log.days[k]||[]).filter(function(x){return x.id!==t.dataset.del;});save();renderToday();
    }
  });
  sec.addEventListener("input",function(e){if(e.target.id==="ixAmt")calc();});
  sec.addEventListener("keydown",function(e){if(e.key==="Enter"&&e.target.id==="ixCode"){e.preventDefault();lookup(e.target.value);}});
  $("ixFile").addEventListener("change",function(e){decodePhoto(e.target.files&&e.target.files[0]);e.target.value="";});
  document.addEventListener("visibilitychange",function(){if(document.hidden)stopScan(true);else renderToday();});
  window.addEventListener("online",function(){if($("ixStatus").classList.contains("warn")&&/offline/.test($("ixStatus").textContent))status("Back online — you can look up barcodes again.");});
  (function midnight(){var n=new Date();n.setHours(24,0,5,0);setTimeout(function(){renderToday();midnight();},n-new Date());})();
}
window.Intake={
  init:function(meals){
    MEALS=meals||{};load();prune();save();
    $("scan").innerHTML=html();bind();renderToday();
  },
  show:function(){renderToday();},
  hide:function(){stopScan(true);},
  _add:addEntry,_lookup:lookup,_decodePhoto:decodePhoto
};
})();
