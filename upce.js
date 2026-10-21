/* Small UPC-E decoder (ZXing-js's UPC-E reader is broken). Works on a canvas. MIT-style, written for this app. */
(function(){
"use strict";
var L=[[3,2,1,1],[2,2,2,1],[2,1,2,2],[1,4,1,1],[1,1,3,2],[1,2,3,1],[1,1,1,4],[1,3,1,2],[1,2,1,3],[3,1,1,2]];
var PAR=[[56,52,50,49,44,38,35,42,41,37],[7,11,13,14,19,25,28,21,22,1]];
function toUPCA(e){ // e = 8-digit UPC-E incl. number system + check
  var d=e.slice(1,7),n=d.charAt(5),r=e.charAt(0);
  if(n<"3")r+=d.slice(0,2)+n+"0000"+d.slice(2,5);
  else if(n==="3")r+=d.slice(0,3)+"00000"+d.slice(3,5);
  else if(n==="4")r+=d.slice(0,4)+"00000"+d.charAt(4);
  else r+=d.slice(0,5)+"0000"+n;
  return r+e.charAt(7);
}
function checkUPCA(a){var s=0;for(var i=0;i<11;i++)s+=(+a[i])*(i%2?1:3);return (10-s%10)%10===+a[11];}
function matchDigit(w){ // w: 4 run widths (space,bar,space,bar)
  var t=w[0]+w[1]+w[2]+w[3],best=-1,be=1e9,g=false;
  for(var d=0;d<10;d++)for(var p=0;p<2;p++){
    var pat=p?[L[d][3],L[d][2],L[d][1],L[d][0]]:L[d],e=0;
    for(var k=0;k<4;k++){var x=w[k]*7/t-pat[k];e+=x*x;}
    if(e<be){be=e;best=d;g=!!p;}
  }
  return be<1.2?{d:best,g:g}:null;
}
function tryRuns(runs,firstDark){
  // runs alternate dark/light starting with colour firstDark
  for(var i=0;i+33<=runs.length;i++){
    var dark=((i%2===0)===firstDark);if(!dark)continue;
    var seg=runs.slice(i,i+33),tot=0;for(var k=0;k<33;k++)tot+=seg[k];
    var m=tot/51;if(m<1)continue;
    var ok=true;
    for(k=0;k<3&&ok;k++)if(Math.abs(seg[k]/m-1)>0.7)ok=false;
    for(k=27;k<33&&ok;k++)if(Math.abs(seg[k]/m-1)>0.7)ok=false;
    if(!ok)continue;
    var before=i>0?runs[i-1]:0,after=i+33<runs.length?runs[i+33]:0;
    if(before<m*3||after<m*3)continue;
    var digits="",lg=0;
    for(var x=0;x<6;x++){var r=matchDigit(seg.slice(3+x*4,7+x*4));if(!r){ok=false;break;}digits+=r.d;if(r.g)lg|=1<<(5-x);}
    if(!ok)continue;
    for(var ns=0;ns<2;ns++)for(var c=0;c<10;c++)if(PAR[ns][c]===lg){
      var code=ns+digits+c;if(checkUPCA(toUPCA(code)))return code;
    }
  }
  return null;
}
function decodeCanvas(cv){
  var ctx=cv.getContext("2d",{willReadFrequently:true}),W=cv.width,H=cv.height;
  for(var f=0;f<15;f++){
    var y=Math.round(H*(0.5+((f%2?1:-1)*Math.ceil(f/2))*0.04));if(y<0||y>=H)continue;
    var px=ctx.getImageData(0,y,W,1).data,g=new Array(W),mn=255,mx=0;
    for(var x=0;x<W;x++){var v=(px[x*4]*299+px[x*4+1]*587+px[x*4+2]*114)/1000;g[x]=v;if(v<mn)mn=v;if(v>mx)mx=v;}
    if(mx-mn<40)continue;
    var th=(mn+mx)/2,runs=[],cur=g[0]<th,len=0,first=cur;
    for(x=0;x<W;x++){var dk=g[x]<th;if(dk===cur)len++;else{runs.push(len);cur=dk;len=1;}}
    runs.push(len);
    var r=tryRuns(runs,first);if(r)return r;
    var rev=runs.slice().reverse(),rfirst=(runs.length%2===1)?first:!first;
    r=tryRuns(rev,rfirst);if(r)return r;
  }
  return null;
}
window.UPCE={decodeCanvas:decodeCanvas,toUPCA:toUPCA};
})();
