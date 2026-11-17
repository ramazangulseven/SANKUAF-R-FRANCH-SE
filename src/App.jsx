import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  LayoutDashboard, Store, Wallet, FileText, Receipt, LogOut, Plus,
  RefreshCw, Search, CalendarDays, CircleDollarSign, Landmark, Clock3,
  CheckCircle2, AlertCircle, Eye, ShieldCheck, Menu, X
} from "lucide-react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const money = n => new Intl.NumberFormat("tr-TR", { style:"currency", currency:"TRY", maximumFractionDigits:2 }).format(Number(n || 0));
const today = () => new Date().toISOString().slice(0,10);
const monthNow = () => today().slice(0,7);

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [branches, setBranches] = useState([]);
  const [entries, setEntries] = useState([]);
  const [payments, setPayments] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [month, setMonth] = useState(monthNow());
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({data}) => {
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
      else setLoading(false);
    });
    const { data:{subscription} } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) loadProfile(next.user.id);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId) {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (error) setNotice("Kullanıcı profili bulunamadı. Kurulum adımlarındaki profil oluşturma işlemini kontrol edin.");
    setProfile(data || null);
    setLoading(false);
  }

  async function refresh() {
    if (!supabase || !session) return;
    setBusy(true);
    const [b,e,p,i] = await Promise.all([
      supabase.from("branches").select("*").eq("is_active", true).order("name"),
      supabase.from("monthly_entries").select("*, branches(name)").order("period", {ascending:false}),
      supabase.from("payments").select("*, branches(name)").order("payment_date", {ascending:false}),
      supabase.from("instruments").select("*, branches(name)").order("due_date", {ascending:true})
    ]);
    const err = b.error || e.error || p.error || i.error;
    if (err) setNotice(err.message);
    setBranches(b.data || []); setEntries(e.data || []); setPayments(p.data || []); setInstruments(i.data || []);
    setBusy(false);
  }
  useEffect(() => { if (session && profile) refresh(); }, [session, profile]);

  const isAdmin = profile?.role === "admin";
  const canWrite = ["admin","finance"].includes(profile?.role);
  const filteredBranches = branches.filter(x => x.name.toLowerCase().includes(search.toLowerCase()));
  const monthEntries = entries.filter(x => x.period === month);
  const monthPayments = payments.filter(x => x.payment_date?.slice(0,7) === month);
  const monthCollected = instruments.filter(x => x.status === "collected" && x.collected_date?.slice(0,7) === month);
  const monthAccrued = monthEntries.reduce((s,x)=>s+Number(x.turnover)*0.05+Number(x.dues)+Number(x.adjustment),0);
  const monthCash = monthPayments.reduce((s,x)=>s+Number(x.amount),0) + monthCollected.reduce((s,x)=>s+Number(x.amount),0);
  const portfolio = instruments.filter(x=>["portfolio","endorsed"].includes(x.status)).reduce((s,x)=>s+Number(x.amount),0);
  const balances = useMemo(() => branches.map(b => {
    const accrued = entries.filter(x=>x.branch_id===b.id).reduce((s,x)=>s+Number(x.turnover)*.05+Number(x.dues)+Number(x.adjustment),0);
    const paid = payments.filter(x=>x.branch_id===b.id).reduce((s,x)=>s+Number(x.amount),0);
    const credited = instruments.filter(x=>x.branch_id===b.id && !["dishonored","cancelled"].includes(x.status)).reduce((s,x)=>s+Number(x.amount),0);
    return {...b, accrued, paid, credited, balance:accrued-paid-credited};
  }), [branches,entries,payments,instruments]);

  async function signIn(e) {
    e.preventDefault(); setBusy(true);
    const {error} = await supabase.auth.signInWithPassword({email:loginEmail,password:loginPassword});
    if (error) setNotice(error.message);
    setBusy(false);
  }
  async function signOut() { await supabase.auth.signOut(); }

  async function saveBranch(form) {
    const payload = {name:form.name.trim(), city:form.city.trim(), contact_name:form.contact_name.trim(), phone:form.phone.trim()};
    const {error} = await supabase.from("branches").insert(payload);
    if (error) setNotice(error.message); else { setNotice("Şube kaydedildi."); setModal(""); refresh(); }
  }
  async function saveEntry(form) {
    const {error} = await supabase.from("monthly_entries").upsert({
      branch_id:form.branch_id, period:form.period, turnover:Number(form.turnover),
      dues:Number(form.dues||0), adjustment:Number(form.adjustment||0), note:form.note||""
    }, {onConflict:"branch_id,period"});
    if (error) setNotice(error.message); else { setNotice("Aylık ciro ve tahakkuk kaydedildi."); setModal(""); refresh(); }
  }
  async function savePayment(form) {
    const {error} = await supabase.from("payments").insert({
      branch_id:form.branch_id, amount:Number(form.amount), method:form.method,
      payment_date:form.payment_date, reference:form.reference||"", note:form.note||""
    });
    if (error) setNotice(error.message); else { setNotice("Tahsilat kaydedildi."); setModal(""); refresh(); }
  }
  async function saveInstrument(form) {
    const {error} = await supabase.from("instruments").insert({
      branch_id:form.branch_id, kind:form.kind, amount:Number(form.amount),
      received_date:form.received_date, due_date:form.due_date, bank:form.bank||"",
      drawer:form.drawer||"", instrument_no:form.instrument_no||"", note:form.note||"", status:"portfolio"
    });
    if (error) setNotice(error.message); else { setNotice("Çek/senet portföye alındı ve şube borcundan düşüldü."); setModal(""); refresh(); }
  }
  async function changeInstrument(id, status) {
    const patch = {status};
    if (status === "collected") patch.collected_date = today();
    if (status === "dishonored") patch.collected_date = null;
    const {error} = await supabase.from("instruments").update(patch).eq("id",id);
    if (error) setNotice(error.message); else { setNotice("Çek/senet durumu güncellendi."); refresh(); }
  }
  function exportCsv() {
    const rows = [["Şube","Toplam Tahakkuk","Nakit/Banka Tahsilat","Çek/Senet Kredisi","Kalan Bakiye"]];
    balances.forEach(b=>rows.push([b.name,b.accrued,b.paid,b.credited,b.balance]));
    const csv = "\uFEFF" + rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";")).join("\n");
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); a.download=`sube-bakiyeleri-${today()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  if (!supabase) return <SetupScreen />;
  if (loading) return <div className="loading">Sistem hazırlanıyor…</div>;
  if (!session) return <div className="login-wrap"><div className="login-card"><div className="brand-mark">SK</div><p className="eyebrow">SAN KUAFÖR</p><h1>Franchise Finans</h1><p className="muted">Güvenli kullanıcı girişi</p><form onSubmit={signIn}><label>E-posta<input type="email" required value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} placeholder="ornek@sirket.com"/></label><label>Şifre<input type="password" required value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} placeholder="Şifreniz"/></label><button className="primary full" disabled={busy}>{busy?"Giriş yapılıyor…":"Giriş Yap"}</button></form>{notice&&<p className="notice">{notice}</p>}<small>Hesaplar yönetici tarafından oluşturulur.</small></div></div>;
  if (!profile) return <div className="loading">Kullanıcı yetkisi kontrol ediliyor… {notice}</div>;

  const nav = [
    ["dashboard","Genel Bakış",LayoutDashboard],["branches","Şubeler",Store],
    ["entries","Ciro & Tahakkuk",Receipt],["payments","Tahsilatlar",Wallet],["instruments","Çek / Senet",FileText]
  ];
  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu?"open":""}`}><div className="side-brand"><div className="brand-mark small">SK</div><div><b>SAN KUAFÖR</b><span>FİNANS YÖNETİMİ</span></div><button className="mobile-close" onClick={()=>setMobileMenu(false)}><X/></button></div>
      <div className="nav-label">ÇALIŞMA ALANI</div>{nav.map(([id,label,Icon])=><button key={id} className={`nav-item ${tab===id?"active":""}`} onClick={()=>{setTab(id);setMobileMenu(false)}}><Icon size={18}/>{label}</button>)}
      <div className="side-bottom"><div className="user-chip"><div className="avatar">{(profile.full_name||session.user.email).slice(0,1).toUpperCase()}</div><div><b>{profile.full_name||session.user.email}</b><span>{profile.role==="admin"?"Yönetici":profile.role==="finance"?"Muhasebe":"Görüntüleme"}</span></div></div><button className="nav-item logout" onClick={signOut}><LogOut size={18}/>Güvenli Çıkış</button></div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="mobile-menu" onClick={()=>setMobileMenu(true)}><Menu/></button><div><p className="eyebrow">FRANCHISE OPERASYONLARI</p><h1>{nav.find(n=>n[0]===tab)?.[1]}</h1></div><div className="top-actions"><div className="live-pill"><i/> Ortak veri bağlantısı</div><button className="icon-btn" onClick={refresh} title="Yenile"><RefreshCw size={18}/></button></div></header>
      {notice&&<div className="notice-bar"><span>{notice}</span><button onClick={()=>setNotice("")}>Kapat</button></div>}
      <section className="content">
        {tab==="dashboard"&&<><div className="filter-row"><div><h2>Finansal özet</h2><p className="muted">Seçilen dönemin şube performansı</p></div><label className="month-picker"><CalendarDays size={17}/><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label></div>
          <div className="stats-grid"><Stat icon={CircleDollarSign} label="Aylık tahakkuk" value={money(monthAccrued)} sub="Ciro payı + aidat + düzeltme"/><Stat icon={Wallet} label="Gerçekleşen tahsilat" value={money(monthCash)} sub="Nakit, banka ve tahsil edilen senet"/><Stat icon={FileText} label="Portföydeki çek / senet" value={money(portfolio)} sub="Henüz tahsil edilmemiş"/><Stat icon={AlertCircle} label="Toplam açık bakiye" value={money(balances.reduce((s,b)=>s+b.balance,0))} sub="Tüm dönemler, tüm şubeler"/></div>
          <div className="panel"><div className="panel-head"><div><h3>Şube bakiye durumu</h3><p className="muted">Tüm dönemler üzerinden hesaplanır</p></div><button className="secondary" onClick={exportCsv}>CSV dışa aktar</button></div><BranchTable rows={balances.slice(0,8)}/></div>
          <div className="two-col"><div className="panel"><h3>{month} dönemi</h3><div className="mini-line"><span>Kaydedilen şube cirosu</span><b>{money(monthEntries.reduce((s,x)=>s+Number(x.turnover),0))}</b></div><div className="mini-line"><span>Oluşan %5 franchise payı</span><b>{money(monthEntries.reduce((s,x)=>s+Number(x.turnover)*.05,0))}</b></div><div className="mini-line"><span>Manuel aidat</span><b>{money(monthEntries.reduce((s,x)=>s+Number(x.dues),0))}</b></div></div><div className="panel"><h3>Vade takibi</h3>{instruments.filter(x=>["portfolio","endorsed"].includes(x.status)).sort((a,b)=>a.due_date.localeCompare(b.due_date)).slice(0,5).map(x=><div className="due-row" key={x.id}><div><b>{x.branches?.name}</b><span>{x.kind==="check"?"Çek":"Senet"} · {x.due_date}</span></div><strong>{money(x.amount)}</strong></div>)}{!instruments.some(x=>["portfolio","endorsed"].includes(x.status))&&<p className="muted">Bekleyen çek/senet bulunmuyor.</p>}</div></div>
        </>}
        {tab==="branches"&&<><div className="filter-row"><div><h2>Şube yönetimi</h2><p className="muted">Şubelerin cari finansal görünümü</p></div>{canWrite&&<button className="primary" onClick={()=>setModal("branch")}><Plus size={17}/> Şube ekle</button>}</div><div className="search-box"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Şube ara…"/></div><div className="panel"><BranchTable rows={balances.filter(b=>b.name.toLowerCase().includes(search.toLowerCase()))}/></div></>}
        {tab==="entries"&&<><div className="filter-row"><div><h2>Ciro & tahakkuk</h2><p className="muted">Aylık ciro üzerinden otomatik %5 franchise payı</p></div>{canWrite&&<button className="primary" onClick={()=>setModal("entry")}><Plus size={17}/> Aylık kayıt ekle</button>}</div><div className="panel"><DataTable headers={["Dönem","Şube","Ciro","%5 Pay","Aidat","Düzeltme","Toplam"]} rows={entries.filter(x=>x.period.includes(month)||!month).map(x=>[x.period,x.branches?.name,money(x.turnover),money(x.turnover*.05),money(x.dues),money(x.adjustment),money(x.turnover*.05+Number(x.dues)+Number(x.adjustment))])}/></div></>}
        {tab==="payments"&&<><div className="filter-row"><div><h2>Tahsilatlar</h2><p className="muted">Nakit ve banka tahsilat kayıtları</p></div>{canWrite&&<button className="primary" onClick={()=>setModal("payment")}><Plus size={17}/> Tahsilat gir</button>}</div><div className="panel"><DataTable headers={["Tarih","Şube","Yöntem","Tutar","Referans"]} rows={payments.map(x=>[x.payment_date,x.branches?.name,x.method==="cash"?"Nakit":"Banka",money(x.amount),x.reference||"—"])}/></div></>}
        {tab==="instruments"&&<><div className="filter-row"><div><h2>Çek / senet portföyü</h2><p className="muted">Teslim alındığında şube borcundan düşer; tahsil edilince nakit tahsilata dönüşür.</p></div>{canWrite&&<button className="primary" onClick={()=>setModal("instrument")}><Plus size={17}/> Çek / senet ekle</button>}</div><div className="panel"><DataTable headers={["Şube","Tür","Tutar","Alınma","Vade","Durum","İşlem"]} rows={instruments.map(x=>[x.branches?.name,x.kind==="check"?"Çek":"Senet",money(x.amount),x.received_date,x.due_date,<Status status={x.status}/>,canWrite?<InstrumentActions item={x} onChange={changeInstrument}/>: "—"])}/></div></>}
      </section>
      <footer>San Kuaför Finans Yönetimi <span>·</span> TRY <span>·</span> İstanbul</footer>
    </main>
    {modal&&<Modal title={{branch:"Yeni şube",entry:"Aylık ciro ve tahakkuk",payment:"Tahsilat kaydı",instrument:"Çek / senet teslim al"}[modal]} onClose={()=>setModal("")}>
      {modal==="branch"&&<BranchForm onSave={saveBranch}/>}
      {modal==="entry"&&<EntryForm branches={branches} month={month} onSave={saveEntry}/>}
      {modal==="payment"&&<PaymentForm branches={branches} onSave={savePayment}/>}
      {modal==="instrument"&&<InstrumentForm branches={branches} onSave={saveInstrument}/>}
    </Modal>}
  </div>;
}

function SetupScreen(){return <div className="setup-wrap"><div className="setup-card"><div className="brand-mark">SK</div><p className="eyebrow">SAN KUAFÖR</p><h1>Kurulum gerekiyor</h1><p>Uygulama arayüzü hazır. İnternet üzerinden ortak kullanıma açmak için Supabase proje bilgileri eklenmeli.</p><ol><li><a href="https://supabase.com" target="_blank" rel="noreferrer">Supabase</a> üzerinde ücretsiz bir proje oluşturun.</li><li>SQL Editor bölümünde <b>supabase/schema.sql</b> dosyasını çalıştırın.</li><li>Project Settings → API bölümünden Project URL ve anon key değerlerini alın.</li><li><b>.env.example</b> dosyasını <b>.env</b> olarak kopyalayıp iki değeri girin.</li><li><code>npm install</code> ve <code>npm run dev</code> komutlarıyla çalıştırın.</li></ol><p className="warning">Güvenlik: service_role anahtarını asla tarayıcıya veya .env içindeki VITE_ değişkenlerine koymayın. Yalnızca anon/public key kullanın.</p></div></div>}

function Stat({icon:Icon,label,value,sub}){return <div className="stat-card"><div className="stat-icon"><Icon size={19}/></div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>}
function BranchTable({rows}){return <div className="table-scroll"><table><thead><tr><th>Şube</th><th>Toplam tahakkuk</th><th>Nakit / banka</th><th>Çek / senet</th><th>Kalan bakiye</th></tr></thead><tbody>{rows.map(b=><tr key={b.id}><td><b>{b.name}</b><small>{b.city||"—"}</small></td><td>{money(b.accrued)}</td><td>{money(b.paid)}</td><td>{money(b.credited)}</td><td><b className={b.balance>0?"negative":"positive"}>{money(b.balance)}</b></td></tr>)}</tbody></table>{!rows.length&&<Empty/>}</div>}
function DataTable({headers,rows}){return <div className="table-scroll"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table>{!rows.length&&<Empty/>}</div>}
function Empty(){return <div className="empty"><FileText size={24}/><p>Henüz kayıt bulunmuyor.</p></div>}
function Status({status}){const labels={portfolio:"Portföyde",endorsed:"Bankaya verildi",collected:"Tahsil edildi",dishonored:"Karşılıksız",cancelled:"İptal"};return <span className={`status ${status}`}>{labels[status]||status}</span>}
function InstrumentActions({item,onChange}){return <div className="action-group">{item.status==="portfolio"&&<><button onClick={()=>onChange(item.id,"endorsed")}>Bankaya ver</button><button onClick={()=>onChange(item.id,"collected")}>Tahsil et</button><button className="danger-text" onClick={()=>onChange(item.id,"dishonored")}>Karşılıksız</button></>}{item.status==="endorsed"&&<><button onClick={()=>onChange(item.id,"collected")}>Tahsil et</button><button className="danger-text" onClick={()=>onChange(item.id,"dishonored")}>Karşılıksız</button></>}{["collected","dishonored"].includes(item.status)&&<span>İşlem tamamlandı</span>}</div>}
function Modal({title,onClose,children}){return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose}><X/></button></div>{children}</div></div>}
function Field({label,children}){return <label className="field">{label}{children}</label>}
function BranchForm({onSave}){const [f,S]=useState({name:"",city:"",contact_name:"",phone:""});return <form className="form-grid" onSubmit={e=>{e.preventDefault();onSave(f)}}><Field label="Şube adı"><input required value={f.name} onChange={e=>S({...f,name:e.target.value})}/></Field><Field label="Şehir"><input value={f.city} onChange={e=>S({...f,city:e.target.value})}/></Field><Field label="Yetkili kişi"><input value={f.contact_name} onChange={e=>S({...f,contact_name:e.target.value})}/></Field><Field label="Telefon"><input value={f.phone} onChange={e=>S({...f,phone:e.target.value})}/></Field><button className="primary full span-2">Şubeyi kaydet</button></form>}
function EntryForm({branches,month,onSave}){const [f,S]=useState({branch_id:"",period:month,turnover:"",dues:"0",adjustment:"0",note:""});const fee=Number(f.turnover||0)*.05;return <form className="form-grid" onSubmit={e=>{e.preventDefault();onSave(f)}}><Field label="Şube"><select required value={f.branch_id} onChange={e=>S({...f,branch_id:e.target.value})}><option value="">Şube seçin</option>{branches.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></Field><Field label="Dönem"><input type="month" required value={f.period} onChange={e=>S({...f,period:e.target.value})}/></Field><Field label="Aylık ciro (₺)"><input type="number" min="0" step=".01" required value={f.turnover} onChange={e=>S({...f,turnover:e.target.value})}/></Field><Field label="Manuel aidat (₺)"><input type="number" step=".01" value={f.dues} onChange={e=>S({...f,dues:e.target.value})}/></Field><Field label="Düzeltme / ek tahakkuk (₺)"><input type="number" step=".01" value={f.adjustment} onChange={e=>S({...f,adjustment:e.target.value})}/></Field><Field label="Not"><input value={f.note} onChange={e=>S({...f,note:e.target.value})}/></Field><div className="calc-preview span-2"><span>Otomatik %5 franchise payı</span><b>{money(fee)}</b><span>Toplam aylık tahakkuk</span><b>{money(fee+Number(f.dues||0)+Number(f.adjustment||0))}</b></div><button className="primary full span-2">Kaydı kaydet</button></form>}
function PaymentForm({branches,onSave}){const [f,S]=useState({branch_id:"",amount:"",method:"cash",payment_date:today(),reference:"",note:""});return <form className="form-grid" onSubmit={e=>{e.preventDefault();onSave(f)}}><Field label="Şube"><select required value={f.branch_id} onChange={e=>S({...f,branch_id:e.target.value})}><option value="">Şube seçin</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field><Field label="Tutar (₺)"><input type="number" min=".01" step=".01" required value={f.amount} onChange={e=>S({...f,amount:e.target.value})}/></Field><Field label="Tahsilat yöntemi"><select value={f.method} onChange={e=>S({...f,method:e.target.value})}><option value="cash">Nakit</option><option value="bank">Banka havalesi / EFT</option></select></Field><Field label="Tarih"><input type="date" required value={f.payment_date} onChange={e=>S({...f,payment_date:e.target.value})}/></Field><Field label="Dekont / referans"><input value={f.reference} onChange={e=>S({...f,reference:e.target.value})}/></Field><Field label="Not"><input value={f.note} onChange={e=>S({...f,note:e.target.value})}/></Field><button className="primary full span-2">Tahsilatı kaydet</button></form>}
function InstrumentForm({branches,onSave}){const [f,S]=useState({branch_id:"",kind:"check",amount:"",received_date:today(),due_date:"",bank:"",drawer:"",instrument_no:"",note:""});return <form className="form-grid" onSubmit={e=>{e.preventDefault();onSave(f)}}><Field label="Şube"><select required value={f.branch_id} onChange={e=>S({...f,branch_id:e.target.value})}><option value="">Şube seçin</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field><Field label="Tür"><select value={f.kind} onChange={e=>S({...f,kind:e.target.value})}><option value="check">Çek</option><option value="note">Senet</option></select></Field><Field label="Tutar (₺)"><input type="number" min=".01" step=".01" required value={f.amount} onChange={e=>S({...f,amount:e.target.value})}/></Field><Field label="Teslim alma tarihi"><input type="date" required value={f.received_date} onChange={e=>S({...f,received_date:e.target.value})}/></Field><Field label="Vade tarihi"><input type="date" required value={f.due_date} onChange={e=>S({...f,due_date:e.target.value})}/></Field><Field label="Banka"><input value={f.bank} onChange={e=>S({...f,bank:e.target.value})}/></Field><Field label="Keşideci / borçlu"><input value={f.drawer} onChange={e=>S({...f,drawer:e.target.value})}/></Field><Field label="Çek / senet numarası"><input value={f.instrument_no} onChange={e=>S({...f,instrument_no:e.target.value})}/></Field><Field label="Not"><input value={f.note} onChange={e=>S({...f,note:e.target.value})}/></Field><div className="info-note span-2">Teslim alındığı anda şube borcuna mahsup edilir. Tahsil edildiğinde ikinci kez mahsup yapılmaz.</div><button className="primary full span-2">Portföye kaydet</button></form>}
export default App;
