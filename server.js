const http=require('http'),fs=require('fs'),path=require('path');
const DB_FILE=path.join(__dirname,'db.json');
function readDB(){try{return JSON.parse(fs.readFileSync(DB_FILE,'utf8'))}catch(e){return{superPwd:'li870224',systemName:'业主公共事项投票系统',communities:[]}}}
function writeDB(db){fs.writeFileSync(DB_FILE,JSON.stringify(db,null,2))}
function getC(db,id){return db.communities.find(c=>c.id===id)}

const PAGES={};
['index','admin','super'].forEach(p=>{try{PAGES[p]=fs.readFileSync(path.join(__dirname,p+'.html'),'utf8')}catch(e){PAGES[p]='Page not found'}});

const server=http.createServer((req,res)=>{
  const parsed=new URL(req.url,'http://localhost');
  const p=parsed.pathname,cid=parsed.searchParams.get('cid');
  const ok=(d,code=200)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(d))};
  const body=()=>new Promise(r=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{try{r(JSON.parse(b))}catch(e){r(null)}})});

  if(req.method==='GET'&&p==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(PAGES.index)}
  if(req.method==='GET'&&p==='/admin'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(PAGES.admin)}
  if(req.method==='GET'&&p==='/super'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(PAGES.super)}
  if(req.method==='GET'&&p==='/api/system-name'){return ok({name:readDB().systemName||'业主公共事项投票系统'})}

  if(req.method==='GET'&&p==='/api/config'){if(!cid)return ok({error:'missing cid'},400);const c=getC(readDB(),cid);return c?ok(c.config):ok({error:'not found'},404)}
  if(req.method==='GET'&&p==='/api/results'){
    if(!cid)return ok({error:'missing cid'},400);
    const c=getC(readDB(),cid);
    return c?ok({agree:c.votes.agree,disagree:c.votes.disagree,abstain:c.votes.abstain||0}):ok({error:'not found'},404);
  }
  
  if(req.method==='POST'&&p==='/api/vote'){
    if(!cid)return ok({success:false,message:'missing cid'},400);
    return body().then(data=>{
      if(!data||!data.name||!data.building||!data.room||!data.vote)return ok({success:false,message:'请填写完整必填信息'});
      const db=readDB(),c=getC(db,cid);if(!c)return ok({success:false,message:'not found'});
      for(const f of(c.config.customFields||[])){if(f.required&&(!data.fields||!data.fields[f.key]))return ok({success:false,message:'请填写'+f.label})}
      const vk=data.building+'-'+data.room;
      if(c.votes.voters.find(v=>v.key===vk))return ok({success:false,message:'该房号已投过票'});
      if(data.vote==='agree')c.votes.agree++;
      else if(data.vote==='disagree')c.votes.disagree++;
      else if(data.vote==='abstain')c.votes.abstain=(c.votes.abstain||0)+1;
      c.votes.voters.push({key:vk,name:data.name,building:data.building,room:data.room,fields:data.fields||{},vote:data.vote,sig:data.sig||'',time:new Date().toISOString()});
      writeDB(db);ok({success:true});
    });
  }

  if(req.method==='POST'&&p==='/api/admin/login'){
    return body().then(d=>{if(!d||!d.cid||!d.pwd)return ok({success:false});const db=readDB(),c=getC(db,d.cid);if(!c)return ok({success:false,message:'小区不存在'});ok({success:c.adminPwd===d.pwd,name:c.name,households:c.households})});
  }
  if(req.method==='GET'&&p==='/api/admin'){if(!cid)return ok({error:'missing cid'},400);const c=getC(readDB(),cid);return c?ok(c.votes):ok({error:'not found'},404)}
  if(req.method==='POST'&&p==='/api/admin/config'){
    if(!cid)return ok({success:false},400);
    return body().then(d=>{const db=readDB(),c=getC(db,cid);if(!c)return ok({success:false},404);if(d.pwd!==c.adminPwd)return ok({success:false,message:'密码错误'});c.config=d.config;writeDB(db);ok({success:true})});
  }
  if(req.method==='POST'&&p==='/api/admin/reset'){
    if(!cid)return ok({success:false},400);
    return body().then(d=>{const db=readDB(),c=getC(db,cid);if(!c)return ok({success:false},404);if(d.pwd!==c.adminPwd)return ok({success:false,message:'密码错误'});fs.writeFileSync(path.join(__dirname,'backup_'+cid+'_'+Date.now()+'.json'),JSON.stringify(c.votes,null,2));c.votes={agree:0,disagree:0,abstain:0,voters:[]};writeDB(db);ok({success:true})});
  }
  if(req.method==='POST'&&p==='/api/admin/delete-voter'){
    if(!cid)return ok({success:false},400);
    return body().then(d=>{const db=readDB(),c=getC(db,cid);if(!c)return ok({success:false},404);if(d.pwd!==c.adminPwd)return ok({success:false,message:'密码错误'});const idx=c.votes.voters.findIndex(v=>v.key===d.key);if(idx===-1)return ok({success:false});const v=c.votes.voters[idx];if(v.vote==='agree')c.votes.agree--;else if(v.vote==='disagree')c.votes.disagree--;else if(v.vote==='abstain')c.votes.abstain=Math.max(0,(c.votes.abstain||0)-1);c.votes.voters.splice(idx,1);writeDB(db);ok({success:true})});
  }

  if(req.method==='POST'&&p==='/api/super/login'){
    return body().then(d=>{ok({success:d&&d.pwd===readDB().superPwd})});
  }
  if(req.method==='GET'&&p==='/api/super/list'){
    const db=readDB();
    return ok(db.communities.map(c=>({id:c.id,name:c.name,households:c.households,adminPwd:c.adminPwd,createdAt:c.createdAt,total:c.votes.agree+c.votes.disagree+(c.votes.abstain||0),agree:c.votes.agree,disagree:c.votes.disagree,abstain:c.votes.abstain||0})));
  }
  if(req.method==='POST'&&p==='/api/super/create'){
    return body().then(d=>{const db=readDB();if(d.pwd!==db.superPwd)return ok({success:false,message:'密码错误'});if(!d.name||!d.id)return ok({success:false,message:'缺少信息'});if(getC(db,d.id))return ok({success:false,message:'ID已存在'});db.communities.push({id:d.id,name:d.name,households:d.households||0,adminPwd:d.adminPwd||d.id+'2026',createdAt:new Date().toISOString(),config:{title:d.name+' 投票',subtitle:'全体业主表决'+(d.households?' · 共'+d.households+'户':''),notice:'本投票仅限本小区业主参与，一户一票。',infoItems:[{label:'议题',value:'待定'}],customFields:[]},votes:{agree:0,disagree:0,abstain:0,voters:[]}});writeDB(db);ok({success:true})});
  }
  if(req.method==='POST'&&p==='/api/super/delete'){
    return body().then(d=>{const db=readDB();if(d.pwd!==db.superPwd)return ok({success:false});const i=db.communities.findIndex(c=>c.id===d.id);if(i===-1)return ok({success:false});db.communities.splice(i,1);writeDB(db);ok({success:true})});
  }
  if(req.method==='POST'&&p==='/api/super/reset-pwd'){
    return body().then(d=>{const db=readDB();if(d.pwd!==db.superPwd)return ok({success:false});const c=getC(db,d.cid);if(!c)return ok({success:false});c.adminPwd=d.newPwd;writeDB(db);ok({success:true})});
  }
  if(req.method==='GET'&&p==='/api/super/detail'){if(!cid)return ok({error:'missing cid'},400);const db=readDB(),c=getC(db,cid);return c?ok({id:c.id,name:c.name,households:c.households,adminPwd:c.adminPwd,config:c.config,votes:c.votes}):ok({error:'not found'},404)}
  
  // Super export CSV
  if(req.method==='GET'&&p==='/api/super/export'){
    if(!cid)return ok({error:'missing cid'},400);
    const db=readDB(),c=getC(db,cid);
    if(!c)return ok({error:'not found'},404);
    const voters=c.votes.voters;
    let csv='\uFEFF序号,姓名,楼栋,房号,投票';
    const fieldKeys=[];
    if(c.config&&c.config.customFields){c.config.customFields.forEach(f=>{csv+=','+f.label;fieldKeys.push(f.key)})}
    csv+=',签名,时间\n';
    voters.forEach((v,i)=>{
      const voteLabel=v.vote==='agree'?'赞成':v.vote==='disagree'?'反对':'弃权';
      csv+=(i+1)+','+v.name+','+v.building+','+v.room+','+voteLabel;
      fieldKeys.forEach(k=>{csv+=','+(v.fields&&v.fields[k]?v.fields[k]:'')});
      csv+=','+(v.sig?'有签名':'无');
      csv+=','+new Date(v.time).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+'\n';
    });
    const fname='vote_'+c.id+'.csv';
    res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="'+fname+'"'});
    return res.end(csv);
  }

  res.writeHead(404);res.end('Not Found');
});

const PORT=process.env.PORT||8080;
server.listen(PORT,'0.0.0.0',()=>console.log('running on :'+PORT));
