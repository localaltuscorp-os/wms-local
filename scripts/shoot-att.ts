// @ts-nocheck
import { chromium } from "playwright-core";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { mkdirSync } from "node:fs";
const BASE = "https://wms.mananvasa.com";
const UID = "Rc4buo6UVqWgWFmSjoKLa6ePxnz1";
const OUT = "D:/altus-dashboard/.shots";
function adminAuth(){const app=getApps()[0]??initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g,"\n")})});return getAuth(app);}
async function mint(uid){const ct=await adminAuth().createCustomToken(uid);const k=process.env.NEXT_PUBLIC_FIREBASE_API_KEY;const ex=await(await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${k}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:ct,returnSecureToken:true})})).json();const s=await fetch(`${BASE}/api/auth/session`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idToken:ex.idToken})});const m=/__session=([^;]+)/.exec(s.headers.get("set-cookie")||"");if(!m)throw new Error("no session");return m[1];}
(async()=>{
  mkdirSync(OUT,{recursive:true});
  const val=await mint(UID);
  const b=await chromium.launch();const u=new URL(BASE);
  const today=new Date(Date.now()+5.5*3600000).toISOString().slice(0,10);
  const ctx=await b.newContext({viewport:{width:1500,height:1100},deviceScaleFactor:2});
  await ctx.addCookies([{name:"__session",value:val,domain:u.hostname,path:"/",httpOnly:true,secure:true,sameSite:"Lax"},{name:"sa_gate_skip",value:today,domain:u.hostname,path:"/",secure:true,sameSite:"Lax"}]);
  const p=await ctx.newPage();
  await p.goto(`${BASE}/attendance/dashboard?y=2026&m=6`,{waitUntil:"networkidle",timeout:60000}).catch(()=>{});
  await p.waitForTimeout(1500);
  console.log("url:",p.url());
  await p.screenshot({path:`${OUT}/att-dashboard-june.png`,fullPage:true});
  console.log("shot saved");
  await b.close();process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1)});
