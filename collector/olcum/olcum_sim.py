"""Sahte analizör (Modbus TCP sunucusu) — gerçek cihaz gelmeden okuyucuyu ve paneli denemek için.

Çalıştır:  python3 olcum_sim.py --port 5020 [--profil profiller/entes_mpr.json] [--yok v_l4,thd_i_l1]
Aynı profildeki kayıt haritasını sunar; değerler gün içindeki yük eğrisine göre değişir, enerji sayaçları birikir.
`--yok` ile verilen anahtarların adresleri "adres yok" istisnası döndürür (modele göre eksik kayıt davranışını denemek için).
"""
import argparse
import json
import math
import os
import socket
import struct
import threading
import time

from olcum_modbus import kodla


def degerler(profil, t, durum):
    """Anlık sahte ölçümler (gerçek birimlerde)."""
    saat = (t % 86400) / 3600.0
    yuk = 0.35 + 0.55 * max(0.0, math.sin((saat - 6) / 14 * math.pi))  # 06-20 arası tepe
    yuk += 0.03 * math.sin(t / 37.0)
    v = [229.0 + 1.5 * math.sin(t / 61 + i) for i in range(3)]
    i = [180.0 * yuk * (1 + 0.04 * (k - 1)) for k in range(3)]
    pf = 0.93 + 0.04 * math.sin(t / 900)
    p = [v[k] * i[k] * pf for k in range(3)]
    s = [v[k] * i[k] for k in range(3)]
    q = [math.sqrt(max(s[k] ** 2 - p[k] ** 2, 0)) for k in range(3)]
    d = {
        'v_l1': v[0], 'v_l2': v[1], 'v_l3': v[2],
        'v_l12': v[0] * 1.732, 'v_l23': v[1] * 1.732, 'v_l31': v[2] * 1.732,
        'i_l1': i[0], 'i_l2': i[1], 'i_l3': i[2], 'i_n': abs(i[0] - i[1]) * 0.3,
        'f': 50.0 + 0.02 * math.sin(t / 11),
        'p_l1': p[0], 'p_l2': p[1], 'p_l3': p[2], 'p_ithal': sum(p), 'p_ihrac': 0.0, 'p_top': sum(p),
        'q_l1': q[0], 'q_l2': q[1], 'q_l3': q[2], 'q_top': sum(q),
        's_l1': s[0], 's_l2': s[1], 's_l3': s[2], 's_top': sum(s),
        'pf_l1': pf, 'pf_l2': pf, 'pf_l3': pf, 'pf_top': pf, 'cosphi_top': pf,
        'v_dengesizlik': 0.4, 'i_dengesizlik': 3.0 + 6 * abs(math.sin(t / 3000)),
        'saat_sayaci': durum['baslangic_saat'] + (t - durum['t0']) / 3600.0,
        'thd_v_l12': 1.6, 'thd_v_l23': 1.6, 'thd_v_l31': 1.6,
        'thd_v_l1': 1.8, 'thd_v_l2': 1.7, 'thd_v_l3': 1.9,
        'thd_i_l1': 6.5 + 3 * (1 - yuk), 'thd_i_l2': 6.2 + 3 * (1 - yuk), 'thd_i_l3': 6.8 + 3 * (1 - yuk),
    }
    # Enerji sayaçları: güç × geçen süre birikir (Wh)
    dt = max(t - durum['son_t'], 0)
    durum['son_t'] = t
    durum['e_wh'] += sum(p) * dt / 3600.0
    durum['e_vah'] += sum(s) * dt / 3600.0
    durum['e_q1'] += sum(q) * dt / 3600.0
    d['e_tuketim_wh'] = durum['e_wh']
    d['e_verilen_wh'] = 0
    d['e_tuketim_vah'] = durum['e_vah']
    d['e_verilen_vah'] = 0
    d['e_reaktif_q1_varh'] = durum['e_q1']
    d['e_reaktif_q2_varh'] = d['e_reaktif_q3_varh'] = d['e_reaktif_q4_varh'] = 0
    return d


class Sunucu:
    def __init__(self, profil, port, yok=()):
        self.profil, self.port, self.yok = profil, port, set(yok)
        self.durum = {'t0': time.time(), 'son_t': time.time(), 'e_wh': 1.2e9, 'e_vah': 1.3e9, 'e_q1': 3e8, 'baslangic_saat': 12345.0}
        self.kilit = threading.Lock()
        self.srv = None

    def bellek(self):
        """Adres → 16 bitlik kelime (yalnız profildeki adresler tanımlı)."""
        d = degerler(self.profil, time.time(), self.durum)
        bellek, yasak = {}, set()
        for r in self.profil['kayitlar']:
            if r['anahtar'] in self.yok:
                yasak.update(range(r['adres'], r['adres'] + r['kelime']))
                continue
            ham = d.get(r['anahtar'], 0) / r['carpan']
            for k, w in enumerate(kodla(r['tip'], round(ham) if r['tip'] != 'float' else ham)):
                bellek[r['adres'] + k] = w
        for r in self.profil.get('kimlik', []):
            for k, w in enumerate(kodla(r['tip'], 123456 if r['anahtar'] == 'cihaz_no' else 10203)):
                bellek[r['adres'] + k] = w
        return bellek, yasak

    def istemci(self, c):
        try:
            while True:
                b = c.recv(7)
                if len(b) < 7:
                    return
                tid, pid, uz, birim = struct.unpack('>HHHB', b)
                govde = c.recv(uz - 1)
                fonk, adres, adet = struct.unpack('>BHH', govde[:5])
                if fonk != 3:
                    yanit = struct.pack('>BB', fonk | 0x80, 1)
                else:
                    with self.kilit:
                        bellek, yasak = self.bellek()
                    aralik = range(adres, adres + adet)
                    if any(a in yasak or a not in bellek for a in aralik):
                        yanit = struct.pack('>BB', 0x83, 2)  # geçersiz veri adresi
                    else:
                        veri = b''.join(struct.pack('>H', bellek[a]) for a in aralik)
                        yanit = struct.pack('>BB', 3, len(veri)) + veri
                c.sendall(struct.pack('>HHHB', tid, 0, len(yanit) + 1, birim) + yanit)
        except OSError:
            pass
        finally:
            c.close()

    def baslat(self):
        self.srv = socket.socket()
        self.srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.srv.bind(('127.0.0.1', self.port))
        self.srv.listen(5)
        self.port = self.srv.getsockname()[1]

        def dongu():
            while True:
                try:
                    c, _ = self.srv.accept()
                except OSError:
                    return
                threading.Thread(target=self.istemci, args=(c,), daemon=True).start()

        threading.Thread(target=dongu, daemon=True).start()
        return self

    def durdur(self):
        if self.srv:
            self.srv.close()


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=5020)
    ap.add_argument('--profil', default=os.path.join(os.path.dirname(__file__), 'profiller', 'entes_mpr.json'))
    ap.add_argument('--yok', default='')
    a = ap.parse_args()
    s = Sunucu(json.load(open(a.profil, encoding='utf-8')), a.port, [x for x in a.yok.split(',') if x]).baslat()
    print('Sahte analizör 127.0.0.1:%d üzerinde (Ctrl+C ile durdurun)' % s.port)
    while True:
        time.sleep(3600)
