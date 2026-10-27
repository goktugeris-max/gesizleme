"""Modbus TCP istemcisi (yalnız standart kütüphane) ve profil tabanlı kayıt çözücü.

Neden kendi istemcimiz: sahadaki küçük bilgisayarda (Raspberry Pi vb.) kurulum gerektirmesin, sürüm farkı sorun çıkarmasın.
Yalnız "Read Holding Registers" (0x03) kullanılır; analizör/süzme sayaçlar RS-485 (RTU) olsa da şartnamedeki
RTU-TCP ağ geçidi (gateway) arkasında Modbus TCP olarak görünür.
"""
import socket
import struct

AZAMI_BLOK = 100  # tek istekte en fazla kaç kayıt (Modbus sınırı 125)


class ModbusHata(Exception):
    pass


class ModbusIstisna(ModbusHata):
    """Cihaz 'bu adres yok' vb. istisna yanıtı verdi (kod 1-11)."""

    def __init__(self, kod):
        super().__init__('Modbus istisna kodu %d' % kod)
        self.kod = kod


class Istemci:
    def __init__(self, host, port=502, birim=1, zamanasimi=3.0):
        self.host, self.port, self.birim, self.zamanasimi = host, port, birim, zamanasimi
        self._s = None
        self._tid = 0

    def ac(self):
        self.kapat()
        self._s = socket.create_connection((self.host, self.port), timeout=self.zamanasimi)
        self._s.settimeout(self.zamanasimi)

    def kapat(self):
        if self._s:
            try:
                self._s.close()
            finally:
                self._s = None

    def _oku_tam(self, n):
        tampon = b''
        while len(tampon) < n:
            parca = self._s.recv(n - len(tampon))
            if not parca:
                raise ModbusHata('bağlantı kapandı')
            tampon += parca
        return tampon

    def kayit_oku(self, adres, adet):
        """Holding register oku → 16 bitlik işaretsiz sayılar listesi."""
        if self._s is None:
            self.ac()
        self._tid = (self._tid + 1) & 0xFFFF
        govde = struct.pack('>BBHH', self.birim, 3, adres, adet)
        try:
            self._s.sendall(struct.pack('>HHH', self._tid, 0, len(govde)) + govde)
            baslik = self._oku_tam(7)
            _tid, _pid, uzunluk, _birim = struct.unpack('>HHHB', baslik)
            yanit = self._oku_tam(uzunluk - 1)
        except (OSError, ModbusHata):
            self.kapat()
            raise
        fonk = yanit[0]
        if fonk == 0x83:
            raise ModbusIstisna(yanit[1])
        if fonk != 3:
            raise ModbusHata('beklenmeyen fonksiyon 0x%02X' % fonk)
        n = yanit[1]
        if n != adet * 2:
            raise ModbusHata('kayıt sayısı uyuşmuyor (%d != %d)' % (n // 2, adet))
        return list(struct.unpack('>%dH' % adet, yanit[2:2 + n]))


# ---- Kayıt çözme / kodlama (MSB first, yüksek kelime önce) ----

def coz(tip, kelimeler):
    ham = b''.join(struct.pack('>H', k) for k in kelimeler)
    if tip == 'uint16':
        return struct.unpack('>H', ham)[0]
    if tip == 'uint32':
        return struct.unpack('>I', ham)[0]
    if tip == 'int32':
        return struct.unpack('>i', ham)[0]
    if tip == 'uint64':
        return struct.unpack('>Q', ham)[0]
    if tip == 'float':
        return struct.unpack('>f', ham)[0]
    raise ValueError('bilinmeyen tip: ' + tip)


def kodla(tip, deger):
    if tip == 'uint16':
        ham = struct.pack('>H', int(deger))
    elif tip == 'uint32':
        ham = struct.pack('>I', int(deger))
    elif tip == 'int32':
        ham = struct.pack('>i', int(deger))
    elif tip == 'uint64':
        ham = struct.pack('>Q', int(deger))
    elif tip == 'float':
        ham = struct.pack('>f', float(deger))
    else:
        raise ValueError('bilinmeyen tip: ' + tip)
    return list(struct.unpack('>%dH' % (len(ham) // 2), ham))


def bloklara_ayir(kayitlar, azami=AZAMI_BLOK, bosluk=0):
    """Kayıtları art arda okunabilecek bloklara böler (boşlukta tanımsız adres olabileceğinden varsayılan: yalnız bitişik kayıtlar birleşir)."""
    sirali = sorted(kayitlar, key=lambda r: r['adres'])
    bloklar = []
    for r in sirali:
        son = r['adres'] + r['kelime']
        if bloklar:
            b = bloklar[-1]
            if r['adres'] - b['bitis'] <= bosluk and son - b['bas'] <= azami:
                b['bitis'] = max(b['bitis'], son)
                b['kayitlar'].append(r)
                continue
        bloklar.append({'bas': r['adres'], 'bitis': son, 'kayitlar': [r]})
    return bloklar


def profil_oku(istemci, profil, desteklenmeyen=None):
    """Profildeki kayıtları okuyup {anahtar: değer} döndürür.

    Bir blok istisna verirse (modelde olmayan kayıt) kayıtlar tek tek denenir; hata verenler `desteklenmeyen`
    kümesine eklenir ve sonraki turlarda atlanır. Bağlantı hatasında ModbusHata/OSError yükselir.
    """
    if desteklenmeyen is None:
        desteklenmeyen = set()
    kayitlar = [r for r in profil['kayitlar'] if r['anahtar'] not in desteklenmeyen]
    azami = profil.get('protokol', {}).get('azami_kayit_blogu', AZAMI_BLOK)
    sonuc = {}
    for blok in bloklara_ayir(kayitlar, azami):
        try:
            kelimeler = istemci.kayit_oku(blok['bas'], blok['bitis'] - blok['bas'])
        except ModbusIstisna:
            for r in blok['kayitlar']:
                try:
                    k = istemci.kayit_oku(r['adres'], r['kelime'])
                    sonuc[r['anahtar']] = round(coz(r['tip'], k) * r['carpan'], 6)
                except ModbusIstisna:
                    desteklenmeyen.add(r['anahtar'])
            continue
        for r in blok['kayitlar']:
            o = r['adres'] - blok['bas']
            sonuc[r['anahtar']] = round(coz(r['tip'], kelimeler[o:o + r['kelime']]) * r['carpan'], 6)
    return sonuc
