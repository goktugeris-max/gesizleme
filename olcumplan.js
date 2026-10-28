/* Analizör montaj ve IP planı (ISO 50001 → tesis → Ölçüm altında): AASSM'ye 14, Buz Sporları'na 20 adet akım trafolu analizör (toplam 34).
 * Her nokta için yük grubu, kat/pano, IP adresi + Modbus adresi, CT oranı ve devreye alma durumu panelden girilir (supabase/olcum_plan.sql; tablo anon'a KAPALI,
 * IP'ler depoya/GitHub'a yazılmaz). Okuyucu (collector/olcum/olcum_oku.py --plan-db) IP'si girilmiş noktaları buradan alır ve okumaya başlar.
 * Montajdan sonra IP ve CT ayarları cihazda yapılıp burada karşılığı girilir; "Çevrimiçi" sütunu okuyucunun son okumasından gelir.
 */
(function () {
  const { esc } = Kayit;
  const TESIS = [['aassm', 'AASSM'], ['buz', 'Buz Sporları'], ['buca', 'Buca SYK']], TESIS_AD = Object.fromEntries(TESIS);
  const DURUM = { planlandi: ['Planlandı', 'bg-slate-500/15 text-slate-300'], ip_atandi: ['IP atandı', 'bg-sky-500/15 text-sky-300'], monte: ['Monte edildi', 'bg-amber-500/15 text-amber-400'], devreye: ['Devrede', 'bg-emerald-500/15 text-emerald-400'], test_ok: ['Test tamam', 'bg-emerald-500/25 text-emerald-300'] };
  const MONTE = ['monte', 'devreye', 'test_ok'];
  const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  let tesis = null, son = {};
  const cevrimici = (kod) => { const s = son[kod]; return !!s && s.durum === 'cevrimici' && (Date.now() - new Date(s.zaman).getTime()) / 60000 <= 5; };
  const kart = (b, n, r, alt) => `<div class="glass-card rounded-lg p-2"><div class="text-[10px] uppercase tracking-wider text-slate-500">${b}</div><div class="text-lg font-bold ${r || 'text-slate-200'}">${n}</div>${alt ? `<div class="text-[10px] text-slate-500">${alt}</div>` : ''}</div>`;
  const ctYaz = (r) => (r.ct_primer ? r.ct_primer + '/' + (r.ct_sekonder || 5) + ' A' : '—');

  const k = Kayit.olustur({
    id: 'olcum_plan', tablo: 'olcum_plan', baslik: 'Analizör montaj ve IP planı', sorgu: 'select=*&order=sira.asc.nullslast,kod', suz: (r) => r.tesis === tesis,
    aciklama: 'Akım trafolu analizör noktaları. IP adresi girilen nokta okuyucu tarafından kendiliğinden okunmaya başlar (en geç 5 dakikada). CT oranı ve IP ayarı montajdan sonra cihazda yapılır, burada karşılığı girilir.',
    alanlar: [
      { k: 'tesis', ad: 'Tesis', tip: 'sel', sec: TESIS, zorunlu: true },
      { k: 'kod', ad: 'Nokta kodu', tip: 'text', zorunlu: true, yardim: 'Şartname: tesis – kat/mahal – pano no. Okuma başladıktan sonra değiştirmeyin.' },
      { k: 'ad', ad: 'Nokta adı', tip: 'text', zorunlu: true, genis: true },
      { k: 'yuk_grubu', ad: 'Yük grubu', tip: 'text' },
      { k: 'kat_mahal', ad: 'Kat / mahal', tip: 'text' },
      { k: 'pano', ad: 'Pano no', tip: 'text' },
      { k: 'host', ad: 'IP adresi (ağ geçidi)', tip: 'text', yardim: 'RS-485 hattındaki cihazlar ağ geçidinin IP\'sini paylaşır; Modbus adresi ile ayrılırlar.' },
      { k: 'port', ad: 'Port', tip: 'int', min: 1, max: 65535 },
      { k: 'birim', ad: 'Modbus adresi (1–247)', tip: 'int', min: 1, max: 247 },
      { k: 'ct_primer', ad: 'CT primer (A)', tip: 'int', min: 1, yardim: 'Ör. 400 (400/5 A)' },
      { k: 'ct_sekonder', ad: 'CT sekonder (A)', tip: 'sel', sec: [['5', '5 A'], ['1', '1 A']] },
      { k: 'durum', ad: 'Durum', tip: 'sel', sec: Object.entries(DURUM).map(([d, [e]]) => [d, e]) },
      { k: 'aciklama', ad: 'Açıklama', tip: 'area', genis: true },
    ],
    yeni: () => ({ tesis: tesis, port: 502, birim: 1, ct_sekonder: '5', durum: 'planlandi' }),
    hazirla: (r) => Object.assign({}, r, { ct_sekonder: parseInt(r.ct_sekonder || '5', 10), port: r.port || 502, birim: r.birim || 1, host: r.host || null }),
    oncesi: async (kk) => { son = Object.fromEntries(((await kk.rest('olcum_son?select=nokta_kod,zaman,durum')) || []).map((s) => [s.nokta_kod, s])); },
    araclar: (kk, yaz) => `<button onclick="OlcumPlan.csv('ek1')" title="Yükleniciye verilecek liste (IP adresi içermez)" class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-300">Ek-1 mahal listesi (CSV)</button>
      <button onclick="OlcumPlan.csv('ip')" title="Bilgi İşlem'e verilecek IP/port listesi" class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-300">IP listesi (CSV)</button>
      ${yaz ? '<button onclick="OlcumPlan.topluIp()" title="IP\'si boş noktalara art arda IP verir" class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-300">Toplu IP ata</button>' : ''}`,
    ust: (satirlar) => {
      const a = satirlar.filter((r) => r.aktif !== false && r.tesis === tesis), ip = a.filter((r) => r.host).length, monte = a.filter((r) => MONTE.includes(r.durum)).length, canli = a.filter((r) => cevrimici(r.kod)).length;
      const ctEksik = a.filter((r) => MONTE.includes(r.durum) && !r.ct_primer).length;
      return `<div class="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 text-xs">${kart('Planlanan', a.length, '', TESIS_AD[tesis] || '')}${kart('IP atanan', ip + ' / ' + a.length, ip === a.length && a.length ? 'text-emerald-400' : 'text-sky-300')}${kart('Monte edilen', monte + ' / ' + a.length, monte ? 'text-amber-400' : '')}${kart('Çevrimiçi', canli + ' / ' + a.length, canli ? 'text-emerald-400' : '', 'son 5 dk okuma')}${kart('CT girilmemiş', ctEksik, ctEksik ? 'text-rose-400' : 'text-emerald-400', 'monte edilmiş noktalarda')}</div>`;
    },
    bosIpucu: 'Bu tesis için analizör planı yok. Buca SYK\'nın bina bazlı noktaları mevcut kaynaktan alınır; kırılım analizörleri ikinci faza bırakılmıştır.',
    minGenislik: 820,
    kolonlar: [
      { ad: 'Nokta', deger: (r) => `<div class="text-slate-100">${esc(r.ad)}</div><div class="text-[10px] text-slate-500 font-mono">${esc(r.kod)}</div>` },
      { ad: 'Yük grubu', deger: (r) => esc(r.yuk_grubu || '—') },
      { ad: 'Konum', deger: (r) => esc([r.kat_mahal, r.pano].filter(Boolean).join(' · ') || '—') },
      { ad: 'IP : port / adres', deger: (r) => (r.host ? `<span class="font-mono">${esc(r.host)}:${r.port}</span> <span class="text-slate-500">/ ${r.birim}</span>` : '<span class="text-slate-500">atanmadı</span>') },
      { ad: 'CT', sinif: 'whitespace-nowrap', deger: (r) => ctYaz(r) },
      { ad: 'Durum', deger: (r) => `<span class="px-2 py-0.5 rounded-full text-[10px] ${DURUM[r.durum || 'planlandi'][1]}">${DURUM[r.durum || 'planlandi'][0]}</span>` },
      { ad: 'Canlı', sinif: 'text-center', deger: (r) => (cevrimici(r.kod) ? '<span class="text-emerald-400" title="Son 5 dk içinde okundu">●</span>' : r.host ? '<span class="text-slate-500" title="Okuma yok">○</span>' : '') },
    ],
  });

  // ---------- CSV ----------
  const csvHucre = (v) => { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  function csv(tur) {
    const satirlar = k.satirlar.filter((r) => r.aktif !== false);
    if (!satirlar.length) return k.bildir('İndirilecek nokta yok.', true);
    const baslik = tur === 'ip' ? ['Tesis', 'Nokta kodu', 'Nokta adı', 'IP adresi', 'Port', 'Modbus adresi', 'CT oranı', 'Durum'] : ['Tesis', 'Nokta kodu', 'Nokta adı', 'Yük grubu', 'Kat / mahal', 'Pano no', 'Cihaz', 'CT oranı'];
    const satir = (r) => (tur === 'ip' ? [TESIS_AD[r.tesis], r.kod, r.ad, r.host || '', r.host ? r.port : '', r.host ? r.birim : '', ctYaz(r), DURUM[r.durum][0]] : [TESIS_AD[r.tesis], r.kod, r.ad, r.yuk_grubu || '', r.kat_mahal || '', r.pano || '', 'Akım trafolu çok fonksiyonlu enerji analizörü', r.ct_primer ? r.ct_primer + '/' + (r.ct_sekonder || 5) + ' A' : '']);
    const metin = '﻿' + [baslik].concat(satirlar.map(satir)).map((s) => s.map(csvHucre).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([metin], { type: 'text/csv;charset=utf-8' }));
    a.download = (tur === 'ip' ? 'Olcum_IP_Listesi_' : 'Ek-1_Mahal_Listesi_') + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- toplu IP ----------
  async function topluIp() {
    const bos = k.satirlar.filter((r) => r.aktif !== false && r.tesis === tesis && !r.host);
    if (!bos.length) return k.bildir('Bu tesiste IP\'si boş nokta yok.', true);
    const ilk = prompt(bos.length + ' noktaya sırayla IP verilecek (sondaki sayı birer artar). İlk IP adresi (ör. 10.20.30.101):');
    if (!ilk) return;
    const m = ilk.trim().match(IPV4);
    if (!m || m.slice(1).some((x) => +x > 255)) return k.bildir('Geçerli bir IPv4 adresi girin (ör. 10.20.30.101).', true);
    const son4 = +m[4];
    if (son4 + bos.length - 1 > 254) return k.bildir('Bu başlangıçtan ' + bos.length + ' IP verilemez (son sayı 254\'ü aşar).', true);
    if (!confirm(bos.length + ' noktaya ' + m[1] + '.' + m[2] + '.' + m[3] + '.' + son4 + ' – ' + m[1] + '.' + m[2] + '.' + m[3] + '.' + (son4 + bos.length - 1) + ' arası IP verilsin mi?')) return;
    try {
      for (let i = 0; i < bos.length; i++) await k.rest('olcum_plan?kod=eq.' + encodeURIComponent(bos[i].kod), { method: 'PATCH', prefer: 'return=minimal', body: { host: m[1] + '.' + m[2] + '.' + m[3] + '.' + (son4 + i) } });
      await k.yenile(); k.bildir(bos.length + ' noktaya IP atandı. Okuyucu bunları en geç 5 dakikada alır.');
    } catch (e) { await k.yenile(); k.bildir(e.message || String(e), true); }
  }

  function panel(tesisId, el) { tesis = tesisId; k.ciz(el); }
  window.OlcumPlan = { panel, csv, topluIp };
})();
