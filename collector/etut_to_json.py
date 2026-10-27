#!/usr/bin/env python3
"""Bina enerji etüt raporlarından (SETAŞ Enerji, 2023) panel için data/etut.json üretir.

Kaynak: 3 PDF rapor — Ahmed Adnan Saygun Sanat Merkezi, Aşık Veysel Rekreasyon Alanı (buz pisti + havuz),
İBB Buca Sosyal Yaşam Kampüsü. Değerler raporların "1.1 Künye", "1.6 Enerji tüketimleri" ve
"1.7 Genel bulgular / Tablo 1-5..1-8" bölümlerinden ELLE aktarılmıştır (PDF tabloları çok satırlı olduğundan);
betik toplamları raporun kendi toplam satırlarıyla karşılaştırarak aktarım hatalarını yakalar.
Fiyatlar (TL) 2022 yılı fiyatlarıdır. Çalıştırma: python3 collector/etut_to_json.py  →  data/etut.json
"""
import json, os, sys

# (kod, ad, tür, miktar, birim, tep, tl_yil, co2_ton, yatirim_tl, geri_odeme_yil, vade, zorluk, nbd_tl, omur_yil, kategori, ikiz)
def onlem(*a):
    k = ("kod ad tur miktar birim tep tl_yil co2_ton yatirim_tl geri_odeme_yil vade zorluk nbd_tl omur_yil kategori ikiz").split()
    return dict(zip(k, a))

N = None
BINALAR = [
  {"id": "aassm", "tesis": "aassm", "ad": "Ahmed Adnan Saygun Sanat Merkezi", "kisa": "AASSM", "kullanim": "Sanat merkezi",
   "insaat_yili": "2008", "kullanim_alani_m2": 22700.0, "insaat_alani_m2": 26000.0, "kapali_hacim_m3": 95600.0,
   "isitma_derece_gun": 1008, "sogutma_derece_gun": 728, "sistem": "Isıtmada kazan, soğutmada chiller", "yalitim": "Var",
   "etut_donemi": "03.11.2022 – 03.05.2023", "iso_kapsam": "tam",
   "yillar": {
     "2020": {"elek_kwh": 671165.00, "elek_uretilen_kwh": 0, "gaz_sm3": 107603.00, "elek_tep": 57.72, "gaz_tep": 88.77, "toplam_tep": 146.49, "elek_tl": 632430.05, "gaz_tl": 203827.09},
     "2021": {"elek_kwh": 974052.17, "elek_uretilen_kwh": 0, "gaz_sm3": 77767.34, "elek_tep": 83.77, "gaz_tep": 64.16, "toplam_tep": 147.93, "elek_tl": 910323.26, "gaz_tl": 141519.22},
     "2022": {"elek_kwh": 1092412.35, "elek_uretilen_kwh": 0, "gaz_sm3": 86084.66, "elek_tep": 93.95, "gaz_tep": 71.02, "toplam_tep": 164.97, "elek_tl": 4161720.77, "gaz_tl": 390420.85}},
   "toplam_onlem": {"tep": 12.45, "tl_yil": 704868.23, "co2_ton": 66.28, "yatirim_tl": 764728.65, "geri_odeme_yil": 1.08, "elek_kwh": 123177.53, "gaz_sm3": 2254.81},
   "onlemler": [
     onlem("aassm-01", "Elektrikli cihazlarda stand-by tüketiminin önlenmesi", "elektrik", 2996.88, "kWh", 0.26, 16628.22, 1.51, 0.0, 0.0, "Derhal", N, N, N, "standby", N),
     onlem("aassm-02", "Yalıtımsız tesisat hatlarına yalıtım uygulaması", "doğalgaz", 901.39, "Sm³", 0.74, 8562.03, 1.73, 11796.28, 1.38, "Kısa", N, 33925.14, 10, "yalıtım", "kabuk"),
     onlem("aassm-03", "Kazanlarda brülör ayarı yapılması", "doğalgaz", 1353.42, "Sm³", 1.12, 12855.69, 2.60, 7696.39, 0.60, "Kısa", N, 41523.20, 0.5, "kazan", "kazan"),
     onlem("aassm-04", "Aydınlatma armatürlerinin LED ile değiştirilmesi", "elektrik", 104201.77, "kWh", 8.96, 578163.54, 52.41, 345528.55, 0.60, "Kısa", N, 8744891.01, 20, "led", "led"),
     onlem("aassm-05", "Aspiratör-vantilatör motorlarının verimli motorlarla değiştirilmesi", "elektrik", 8361.98, "kWh", 0.72, 46396.43, 4.21, 196907.44, 4.24, "Orta", N, 282687.67, 15, "motor", N),
     onlem("aassm-06", "Pompa motorlarının verimli motorlarla değiştirilmesi", "elektrik", 7616.89, "kWh", 0.66, 42262.32, 3.83, 202799.99, 4.80, "Orta", N, 455329.43, 15, "motor", N)],
   "alternatif": [
     onlem("aassm-a1", "Çatı GES (180 kWe)", "elektrik", 294420.0, "kWh", 25.32, 1621207.64, N, 4677641.99, 2.89, "Uzun", "Zor", 31781074.74, 25, "ges", "ges")],
   "alternatif_kw": 180.0,
   "tabloya_alinmayan": [
     {"ad": "Mevcut kazanların yoğuşmalı kaskad sistemiyle değişimi", "tl_yil": 84716.07, "yatirim_tl": 1004015.35, "geri_odeme_yil": 11.85},
     {"ad": "Masaüstü bilgisayar ve monitörlerin dizüstü ile değişimi", "tl_yil": N, "yatirim_tl": N, "geri_odeme_yil": 13.95}]},
  {"id": "buz", "tesis": "buz", "ad": "Aşık Veysel Rekreasyon Alanı (Buz Sporları Salonu ve Havuz)", "kisa": "Aşık Veysel", "kullanim": "Spor salonu / havuz",
   "insaat_yili": "2010 (buz pisti), 2020 (havuz)", "kullanim_alani_m2": 14788.62, "insaat_alani_m2": 5117.54, "kapali_hacim_m3": 63498.92,
   "isitma_derece_gun": 1008, "sogutma_derece_gun": 728, "sistem": "Kazan, chiller, klima santralleri, VRF", "yalitim": "Yalıtımlı",
   "etut_donemi": "2022–2023", "iso_kapsam": "tam",
   "yillar": {
     "2020": {"elek_kwh": 2065458.15, "elek_uretilen_kwh": 0, "gaz_sm3": 85724.30, "elek_tep": 177.63, "gaz_tep": 70.72, "toplam_tep": 248.35, "elek_tl": 1759076.83, "gaz_tl": 150438.94},
     "2021": {"elek_kwh": 2932965.00, "elek_uretilen_kwh": 1620.60, "elek_uretilen_tep": 0.14, "gaz_sm3": 152914.45, "elek_tep": 252.23, "gaz_tep": 126.15, "toplam_tep": 378.53, "elek_tl": 2752985.11, "gaz_tl": 337701.18},
     "2022": {"elek_kwh": 3323662.65, "elek_uretilen_kwh": 175563.60, "elek_uretilen_tep": 15.10, "gaz_sm3": 224761.77, "elek_tep": 285.83, "gaz_tep": 185.43, "toplam_tep": 486.36, "elek_tl": 11627935.72, "gaz_tl": 1386062.45}},
   "toplam_onlem": {"tep": 63.20, "tl_yil": 1855785.19, "co2_ton": 229.33, "yatirim_tl": 3190138.92, "geri_odeme_yil": 1.72, "elek_kwh": 271756.85, "gaz_sm3": 48282.91},
   "onlemler": [
     onlem("buz-01", "Kazanlarda brülör ayarı yapılması", "doğalgaz", 5916.22, "Sm³", 4.88, 54179.01, 11.35, 22991.31, 0.42, "Kısa", "Kolay", 65969.79, 1, "kazan", "kazan"),
     onlem("buz-02", "Buz pistindeki mevcut kazanların kaskad sistemiyle değiştirilmesi", "doğalgaz", 14393.57, "Sm³", 11.87, 131812.00, 27.62, 474134.25, 3.60, "Uzun", "Orta", -293223.61, 20, "kazan", "kazan"),
     onlem("buz-03", "Buz pistinde güney ve batı (ana giriş) cephesinde cam filmi uygulaması", "elektrik", 151522.28, "kWh", 13.03, 788188.58, 76.22, 2052664.99, 2.60, "Uzun", "Orta", -816038.66, 10, "yalıtım", N),
     onlem("buz-04", "Buz pistinde buffer tankı ayaklarında yalıtım", "elektrik", 13319.92, "kWh", 1.15, 69287.55, 6.70, 24000.00, 0.35, "Kısa", "Kolay", 185523.23, 10, "yalıtım", N),
     onlem("buz-05", "Buz pistinde klima santrallerinde SET değeri ayarı", "doğalgaz", 1673.56, "Sm³", 1.38, 15325.95, 3.21, 25960.00, 1.69, "Orta", "Kolay", 7077.16, N, "işletme", "kazan"),
     onlem("buz-06", "Buz pistine açılan kapıların ısı yalıtımlı kapılarla değiştirilmesi", "elektrik", 2599.945, "kWh", 0.22, 13524.39, 1.31, 88000.00, 6.51, "Uzun", "Kolay", -100792.20, 10, "yalıtım", N),
     onlem("buz-07", "Buz pistinde sahadaki bariyerlerde ısı yalıtımı", "elektrik", 14369.62, "kWh", 1.24, 74747.89, 7.23, 60000.00, 0.80, "Kısa", "Kolay", 164272.48, 10, "yalıtım", N),
     onlem("buz-08", "Tesisatta sıcak hatlarda yalıtım uygulaması", "doğalgaz", 15893.15, "Sm³", 13.11, 145544.68, 30.49, 42195.19, 0.29, "Kısa", "Kolay", 442589.58, 10, "yalıtım", "kabuk"),
     onlem("buz-09", "Tesisatta soğuk hatlarda yalıtım uygulaması", "elektrik", 24601.86, "kWh", 2.12, 127973.97, 12.37, 13538.21, 0.11, "Kısa", "Kolay", 427905.79, 10, "yalıtım", N),
     onlem("buz-10", "Tesisatta eşanjörlere yalıtım ceketi uygulaması", "doğalgaz", 10406.41, "Sm³", 8.59, 95298.75, 19.97, 10657.43, 0.11, "Kısa", "Kolay", 19963.94, 10, "yalıtım", "kabuk"),
     onlem("buz-11", "Havuz sirkülasyon pompa motorlarının değişimi", "elektrik", 2456.06, "kWh", 0.21, 12775.92, 1.24, 23303.48, 1.82, "Orta", "Orta", 3165.16, N, "motor", N),
     onlem("buz-12", "Havuz pompa hatlarındaki çapların uygun çaptaki borularla değiştirilmesi", "elektrik", 6448.90, "kWh", 0.55, 33545.87, 3.24, 5559.81, 0.17, "Kısa", "Orta", 99786.84, 20, "motor", N),
     onlem("buz-13", "Aydınlatmaların LED ile değiştirilmesi", "elektrik", 53344.35, "kWh", 4.59, 277486.63, 26.83, 347134.24, 1.25, "Orta", "Orta", 330217.01, 10, "led", "led"),
     onlem("buz-14", "Elektrikli cihazlarda stand-by tüketiminin iyileştirilmesi", "elektrik", 3093.93, "kWh", 0.27, 16094.01, 1.56, 0.0, 0.0, "Derhal", "Kolay", N, N, "standby", N),
     onlem("buz-15", "Chiller soğutma gruplarında evaporatif soğutma yapılması (kondenser giriş havası soğutma)", "elektrik", N, N, N, N, N, N, N, N, N, N, N, "soğutma", N),
     onlem("buz-16", "Tüketim dağılımına uygun elektrik tarifesine geçilmesi", "elektrik", N, N, N, N, N, N, N, N, N, N, N, "tarife", N)],
   "alternatif": [
     onlem("buz-a1", "Çatı GES (712 kWe)", "elektrik", 931952.0, "kWh", 80.15, 5379524.06, N, 15745806.88, 2.93, "Orta", "Zor", 7584850.42, 25, "ges", "ges"),
     onlem("buz-a2", "Konsantre güneş enerjisi kurulumu (ısıl)", "doğalgaz", 158005.06, "Sm³", 130.35, 1446962.97, N, 15222000.00, 10.52, "Uzun", "Zor", -8946612.66, 25, "güneş ısıl", N)],
   "alternatif_kw": 712.0,
   "tabloya_alinmayan": []},
  {"id": "buca", "tesis": "buca", "ad": "İBB Buca Sosyal Yaşam Kampüsü", "kisa": "Buca SYK", "kullanim": "Hizmet binası",
   "insaat_yili": "2016", "kullanim_alani_m2": 49785.90, "insaat_alani_m2": 54602.0, "kapali_hacim_m3": 221266.0,
   "isitma_derece_gun": 1008, "sogutma_derece_gun": 728, "sistem": "Kazan / chiller / klima santrali", "yalitim": "Mevcut",
   "etut_donemi": "2022–2023", "iso_kapsam": "kismi",
   "yillar": {
     "2020": {"elek_kwh": 3135005.44, "elek_uretilen_kwh": 0, "gaz_sm3": 801131.94, "elek_tep": 269.61, "gaz_tep": 660.93, "toplam_tep": 930.54, "elek_tl": 2801468.05, "gaz_tl": 1545703.97},
     "2021": {"elek_kwh": 3530863.55, "elek_uretilen_kwh": 0, "gaz_sm3": 657266.15, "elek_tep": 303.65, "gaz_tep": 542.24, "toplam_tep": 845.90, "elek_tl": 3451068.78, "gaz_tl": 1915591.28},
     "2022": {"elek_kwh": 3804609.54, "elek_uretilen_kwh": 0, "gaz_sm3": 817673.49, "elek_tep": 327.20, "gaz_tep": 674.58, "toplam_tep": 1001.78, "elek_tl": 12860227.99, "gaz_tl": 6643897.51}},
   "toplam_onlem": {"tep": 32.83, "tl_yil": 1424421.05, "co2_ton": 161.10, "yatirim_tl": 2569104.02, "geri_odeme_yil": 1.80, "elek_kwh": 279677.86, "gaz_sm3": 10643.71},
   "onlemler": [
     onlem("buca-01", "Yalıtımsız tesisat hatlarına yalıtım uygulaması", "doğalgaz", 5287.13, "Sm³", 4.36, 69823.41, 10.14, 23445.02, 0.34, "Kısa", N, 293882.46, 10, "yalıtım", "kabuk"),
     onlem("buca-02", "Kazanlarda brülör ayarı yapılması", "doğalgaz", 5356.58, "Sm³", 4.42, 70740.66, 10.28, 17203.72, 0.24, "Kısa", N, 308970.49, 0.5, "kazan", "kazan"),
     onlem("buca-03", "Kuru gıda deposunun bodruma taşınması", "elektrik", 10368.00, "kWh", 0.89, 45706.29, 5.22, 0.0, 0.0, "Derhal", N, N, N, "işletme", N),
     onlem("buca-04", "Sürekli kontrollerle reaktif ceza önlenmesi", "elektrik", N, "kWh", N, 21216.39, N, 0.0, 0.0, "Derhal", N, N, N, "tarife", N),
     onlem("buca-05", "Tarife değişikliği", "elektrik", N, "kWh", N, 29708.70, N, 0.0, 0.0, "Derhal", N, N, N, "tarife", N),
     onlem("buca-06", "Klima santrali motorlarının verim artırımı", "elektrik", 4311.58, "kWh", 0.37, 19007.19, 2.17, 61304.11, 3.23, "Orta", N, 42572.42, 15, "motor", N),
     onlem("buca-07", "Elektrikli cihazlarda stand-by tüketiminin önlenmesi", "elektrik", 3974.91, "kWh", 0.34, 17522.99, 2.00, 0.0, 0.0, "Derhal", N, N, N, "standby", N),
     onlem("buca-08", "Aydınlatma armatürlerinin LED dönüşümü", "elektrik", 261023.37, "kWh", 22.45, 1150695.41, 131.29, 2467151.18, 2.14, "Orta", N, 9294068.09, 20, "led", "led")],
   "alternatif": [
     onlem("buca-a1", "Çatı GES (1.034 kWe)", "elektrik", 1366279.0, "kWh", 117.50, 6958002.85, N, 22900128.19, 3.29, "Uzun", "Zor", 54601571.62, 25, "ges", "ges")],
   "alternatif_kw": 1034.0,
   "tabloya_alinmayan": [
     {"ad": "Pompa motorlarının verimli motorla değişimi", "tl_yil": 20943.09, "yatirim_tl": 382655.92, "geri_odeme_yil": 18.27},
     {"ad": "Masaüstü bilgisayarların dizüstü ile değişimi", "tl_yil": 121706.89, "yatirim_tl": 1899810.00, "geri_odeme_yil": 15.61},
     {"ad": "Kazanların yoğuşmalı kaskad kazanlarla değişimi", "tl_yil": 394534.48, "yatirim_tl": 5084906.87, "geri_odeme_yil": 12.89}]},
]

def kontrol():
    for b in BINALAR:
        tep = sum(o["tep"] or 0 for o in b["onlemler"])
        assert abs(tep - b["toplam_onlem"]["tep"]) < 0.05, (b["id"], "TEP", tep)
        tl = sum(o["tl_yil"] or 0 for o in b["onlemler"])
        assert abs(tl - b["toplam_onlem"]["tl_yil"]) < 1, (b["id"], "TL", tl)
        co2 = sum(o["co2_ton"] or 0 for o in b["onlemler"])
        assert abs(co2 - b["toplam_onlem"]["co2_ton"]) < 0.1, (b["id"], "CO2", co2)
        yat = sum(o["yatirim_tl"] or 0 for o in b["onlemler"])
        assert abs(yat - b["toplam_onlem"]["yatirim_tl"]) < 1, (b["id"], "yatırım", yat)
        for y, v in b["yillar"].items():
            assert abs(v["elek_tep"] + v["gaz_tep"] + v.get("elek_uretilen_tep", 0) - v["toplam_tep"]) < 0.05, (b["id"], y, "TEP toplamı")
            if y == "2022":
                ek = sum(o["miktar"] for o in b["onlemler"] if o["tur"] == "elektrik" and o["birim"] == "kWh" and o["miktar"])
                eg = sum(o["miktar"] for o in b["onlemler"] if o["tur"] == "doğalgaz" and o["miktar"])
                assert abs(ek - b["toplam_onlem"]["elek_kwh"]) < 1, (b["id"], "elektrik kWh", ek)
                assert abs(eg - b["toplam_onlem"]["gaz_sm3"]) < 1, (b["id"], "gaz Sm3", eg)

if __name__ == "__main__":
    kontrol()
    cikti = {
        "kaynak": "SETAŞ Enerji San. Tic. Ltd. Şti. — Bina Enerji Verimliliği Etüt Raporları (Mayıs 2023), İzmir Büyükşehir Belediyesi",
        "not": "TL değerleri 2022 fiyatlarıdır. Alternatif enerji (GES, güneş ısıl) önlemlerden ayrı raporlanmıştır.",
        "tep_kwh": 11630,
        "binalar": BINALAR,
    }
    yol = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "etut.json")
    with open(yol, "w", encoding="utf-8") as f:
        json.dump(cikti, f, ensure_ascii=False, separators=(",", ":"))
    print("yazıldı:", os.path.normpath(yol), os.path.getsize(yol), "bayt")
