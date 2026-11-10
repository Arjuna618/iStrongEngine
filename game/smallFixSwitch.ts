const _g = globalThis as { __ISTRONG_OLD_FIX?: unknown; process?: { env?: Record<string, string | undefined> } };
const _raw = typeof _g.__ISTRONG_OLD_FIX === 'string' ? _g.__ISTRONG_OLD_FIX : (_g.process?.env?.ISTRONG_OLD_FIX ?? '');
const _offList = _raw.split(',').map(s => s.trim()).filter(Boolean);
const _all = _offList.includes('all');
const _on = (key: string): number => (_all || _offList.includes(key)) ? 0 : 1;

type SmallFixKeys = {
  CH033: number;
  CH024: number;
  GH189: number;
  GH190: number;
  GH186: number;
  GH187: number;
  CH027: number;
  CH029: number;
  CH031: number;
  CH032: number;
  CH023: number;
  GH174: number;
  GH163: number;
  CH026: number;
  E638: number;
  DREAD_EVOLVE: number;
  BOSS_PORTALS: number;
  CH036: number;
  CH035: number;
  CH034: number;
  R657: number;
  R656: number;
  R658: number;
  R660: number;
  R661: number;
  R663: number;
  R664: number;
  R665: number;
  R666: number;
  R667: number;
  CC013: number;
  CC014: number;
  CC003: number;
  CC008: number;
  CC004: number;
  CC010: number;
  CC011: number;
  CC049: number;
  CC050: number;
  CC035: number;
  CC044: number;
  CC012: number;
  CC021: number;
  CC024: number;
  CC026: number;
  CC023: number;
  CC030: number;
  CC031: number;
  CC028: number;
  CC029: number;
  CC032: number;
  CC033: number;
  CC034: number;
  CC043: number;
  CC041: number;
  CC009: number;
  CH045: number;
  CH046: number;
  CH047: number;
  CH039: number;
  CC039: number;
  CC040: number;
  R741: number;
  R742: number;
  R744: number;
  R751: number;
  R752: number;
  R752B: number;
  R753: number;
  R754: number;
  R755: number;
  GH311: number;
  GH317: number;
  GH320: number;
  GH326: number;
  GH312: number;
  GH307: number;
  GH319: number;
  GH324: number;
  GH313: number;
  GH314: number;
  GH315: number;
  GH316: number;
  GH321: number;
  GH318: number;
  GH308: number;
  GH309: number;
  GH322: number;
  GH323: number;
  GH285: number;
  GH286: number;
  GH288: number;
  GH289: number;
  GH290: number;
  GH291: number;
  GH293: number;
  GH294: number;
  GH295: number;
  GH296: number;
  GH298: number;
  GH299: number;
  GH300: number;
  GH301: number;
  GH304: number;
  GH305: number;
  GH306: number;
  GH292: number;
  GH297: number;
  GH008: number;
  GH009: number;
  GH010: number;
  GH011: number;
  GH085: number;
  GH162: number;
  CC020: number;
  GH302: number;
  GH303: number;
  NH070: number;
  R708: number;
  GH096: number;
  CRASH_ARRAS: number;
  GH006: number;
  GH014: number;
  R669: number;
  GH331: number;
  GH324B: number;
  GH327: number;
  GH328: number;
  R292: number;
  R301: number;
  R564: number;
  GH329: number;
  CC007: number;
  CC025: number;
  R161: number;
  R633: number;
  R633B: number;
  R9TP: number;
  NH076: number;
  NH036: number;
  R213: number;
  R209: number;
  R173F: number;
  R139C: number;
  R139D: number;
  R148F: number;
  R148H: number;
  R148K: number;
  R148O: number;
  R148D: number;
  R148A: number;
  R157C: number;
  GH337: number;
  GH337B: number;
  GH338: number;
  GH336: number;
  GH332: number;
  GH333: number;
  GH335: number;
  BH73: number;
  BH50: number;
  BH54: number;
  BH76: number;
  BH09: number;
  R146E: number;
  ROCK_IDX: number;
  BT_SHAPE_IDX: number;
  GH284: number;
  NH034: number;
  HASH_BOUND: number;
  SHAPE_HASH_BOUND: number;
  R774D: number;
  R766: number;
  R766B: number;
  R772: number;
  R775: number;
  R776: number;
  R765: number;
  R767: number;
  R771: number;
  R768: number;
  R769: number;
  R770: number;
  R773: number;
  R766C: number;
  GH339: number;
  GH347: number;
  GH349: number;
  GH340: number;
  GH342: number;
  GH341: number;
  GH344: number;
  GH348: number;
  GH346: number;
  GH139: number;
  R781: number;
  R783: number;
  R784: number;
  R785: number;
  R786: number;
  R790: number;
  R791: number;
  R782: number;
  R787: number;
  R788: number;
  R789: number;
  R792: number;
  R793: number;
  R794: number;
  R796: number;
  R795: number;
  R797: number;
  R798: number;
  R799: number;
  R800: number;
  R801: number;
  R802: number;
  R806: number;
  R808: number;
  R803: number;
  R804: number;
  R805: number;
  R807: number;
  R809: number;
  R810: number;
  R811: number;
  R812: number;
  R813: number;
  R814: number;
  R815: number;
  R816: number;
  R817: number;
  R818: number;
  R819: number;
  R820: number;
  R821: number;
  R822: number;
  R833A: number;
  R853: number;
  R855: number;
  R855M: number;
  R857: number;
  R856P: number;
  R868: number;
  GH369: number;
  GH376: number;
  GH436: number;
  GH390: number;
  GH404: number;
  GH412: number;
  GH437: number;
  GH451: number;
  GH360: number;
  GH361: number;
  GH365: number;
  GH367: number;
  GH368: number;
  GH363: number;
  GH370: number;
  GH371: number;
  GH374: number;
  GH372: number;
  GH373: number;
  GH366: number;
  GH384: number;
  GH379: number;
  GH380: number;
  GH491: number;
  GH381: number;
  GH383: number;
  GH387: number;
  GH388: number;
  GH402: number;
  GH403: number;
  GH394: number;
  GH389: number;
  GH405: number;
  GH406: number;
  GH408: number;
  GH413: number;
  GH414: number;
  GH416: number;
  GH466: number;
  GH496: number;
  GH417: number;
  GH418: number;
  GH421: number;
  GH434: number;
  GH426: number;
  GH427: number;
  GH473: number;
  GH457: number;
  GH441: number;
  GH440: number;
  GH438: number;
  GH480: number;
  GH485: number;
  GH484: number;
  GH535: number;
  GH375: number;
  GH540: number;
  GH541: number;
  GH377: number;
  GH410: number;
  GH409: number;
  GH439: number;
  GH512: number;
  GH432: number;
  GH433: number;
  GH479: number;
  GH453: number;
  GH455: number;
  R872: number;
  GH490: number;
  GH504: number;
  GH476: number;
  GH505: number;
  GH516: number;
  GH400: number;
  GH527: number;
  GH401: number;
  GH525: number;
  GH449: number;
  GH465: number;
  GH470: number;
  GH472: number;
  GH515: number;
  GH495: number;
  GH364: number;
  GH444: number;
  GH445: number;
  GH399: number;
  GH423: number;
  GH469: number;
  R873: number;
  GH482: number;
  GH493: number;
  GH393: number;
  GH456: number;
  GH429: number;
  GH499: number;
  GH498: number;
  GH507: number;
  GH509: number;
  GH514: number;
  GH474: number;
  GH494: number;
  GH481: number;
  GH518: number;
  GH517: number;
  GH506: number;
  GH537: number;
  GH508: number;
  GH519: number;
  GH502: number;
  GH511: number;
  GH487: number;
  GH355: number;
  GH425: number;
  GH459: number;
  GH475: number;
  GH510: number;
  GH391: number;
  GH392: number;
  GH522: number;
  GH500: number;
  GH492: number;
  GH420: number;
  GH471: number;
  GH467: number;
  GH397: number;
  GH422: number;
  GH452: number;
  GH524: number;
  GH362: number;
  GH419: number;
  GH450: number;
  GH350: number;
  GH523: number;
  GH462: number;
  GH454: number;
  GH428: number;
  GH407: number;
  GH458: number;
  GH461: number;
  GH513: number;
  GH489: number;
  GH352: number;
  GH356: number;
  GH357: number;
  GH520: number;
  GH353: number;
  GH359: number;
  GH382: number;
  GH460: number;
  GH463: number;
  GH503: number;
  GH431: number;
  GH497: number;
  GH378: number;
  GH430: number;
  GH488: number;
  GH442: number;
  GH446: number;
  GH415: number;
  GH544: number;
  GH354: number;
  GH468: number;
  GH531: number;
  GH351: number;
  GH464: number;
  GH443: number;
  GH358: number;
  R823: number;
  R824: number;
  R825: number;
  R826: number;
  R827: number;
  R829: number;
  R830: number;
  R831: number;
  R832: number;
  GH386: number;
  GH396: number;
  GH435: number;
  GH385: number;
  GH483: number;
  R859: number;
  R889: number;
  R889B: number;
  GH548: number;
  GH574: number;
  GH585: number;
  GH592: number;
  GH609: number;
  GH611: number;
  R897: number;
  GH610: number;
  GH637: number;
  R899: number;
  GH411: number;
  R900: number;
  GH547: number;
  GH564: number;
  GH573: number;
  GH549: number;
  GH550: number;
  GH551: number;
  GH556: number;
  GH567: number;
  GH557: number;
  GH565: number;
  GH575: number;
  GH555: number;
  GH566: number;
  GH572: number;
  GH554: number;
  GH568: number;
  GH569: number;
  GH596: number;
  GH597: number;
  GH593: number;
  GH594: number;
  GH623: number;
  GH622: number;
  GH625: number;
  GH626: number;
  GH595: number;
  GH545: number;
  GH600: number;
  GH601: number;
  GH602: number;
  GH620: number;
  GH621: number;
  GH603: number;
  GH617: number;
  GH560: number;
  GH627: number;
  GH571: number;
  GH583: number;
  GH587: number;
  GH590: number;
  GH591: number;
  GH628: number;
  GH612: number;
  GH598: number;
  GH584: number;
  GH586: number;
  GH614: number;
  GH559: number;
  GH561: number;
  GH562: number;
  GH563: number;
  GH578: number;
  GH616: number;
  GH634: number;
  GH631: number;
  GH589: number;
  GH599: number;
  GH619: number;
  GH615: number;
  GH635: number;
  GH604: number;
  GH605: number;
  GH607: number;
  GH618: number;
  GH636: number;
  GH632: number;
  GH633: number;
  GH624: number;
  GH553: number;
  GH579: number;
  GH552: number;
  GH576: number;
  GH448: number;
  GH532: number;
  GH398: number;
  GH536: number;
  GH533: number;
  GH539: number;
  GH629: number;
  GH630: number;
  GH588: number;
  GH538: number;
  GH534: number;
  GH530: number;
  GH582: number;
  GH486: number;
  R903: number;
  R904: number;
  R906: number;
  R887: number;
  R884: number;
  R885: number;
  R883: number;
  R876: number;
  R886: number;
  R882: number;
  R879: number;
  R880: number;
  R881: number;
  R902: number;
  GH577: number;
  GH581: number;
  GH608: number;
  R927: number;
  CC001: number;
  CC027: number;
  CC036: number;
  CC037: number;
  CC053: number;
  NH013: number;
  NH067: number;
  CC048: number;
  CC018: number;
  CC017: number;
  GH543: number;
  GH325: number;
  BH04: number;
  R13: number;
  R936: number;
  G638: number;
  G639: number;
  G640: number;
  G704: number;
  G641: number;
  G678: number;
  G705: number;
  G665: number;
  G689: number;
  G690: number;
  G652: number;
  G653: number;
  G654: number;
  G644: number;
  G646: number;
  G649: number;
  G686: number;
  G685: number;
  G687: number;
  G691: number;
  G669: number;
  G672: number;
  G679: number;
  G680: number;
  G681: number;
  G682: number;
  G683: number;
  G709: number;
  G711: number;
  G719: number;
  G703: number;
  G706: number;
  G694: number;
  G692: number;
  G700: number;
  G710: number;
  G733: number;
  G647: number;
  G648: number;
  G707: number;
  G661: number;
  G662: number;
  G701: number;
  G664: number;
  G670: number;
  G698: number;
  G673: number;
  G675: number;
  G677: number;
  G696: number;
  G697: number;
  G714: number;
  G716: number;
  G732: number;
  R896: number;
  G674: number;
  G724: number;
  G712: number;
  G702: number;
  G721: number;
  G606: number;
  G613: number;
  R895: number;
  R898: number;
  G720: number;
  R939: number;
  R907: number;
  R908: number;
  R909: number;
  R910: number;
  R911: number;
  R912: number;
  R913: number;
  R914: number;
  G645: number;
  G650: number;
  G722: number;
  G708: number;
  G655: number;
  G656: number;
  G657: number;
  G666: number;
  G667: number;
  G725: number;
  G727: number;
  G734: number;
  G728: number;
  G660: number;
  G726: number;
  G659: number;
  G663: number;
  G668: number;
  G699: number;
  G715: number;
  G676: number;
  G723: number;
  G730: number;
  G729: number;
  G731: number;
  CC002: number;
  NH065: number;
  CC042: number;
  NH059: number;
  NH069: number;
  NH055: number;
  GH145: number;
  CC054: number;
  R934: number;
  R107: number;
  R120: number;
  CC047: number;
  CC052: number;
  GH580: number;
  NH062: number;
  NH064: number;
  NH014: number;
  CC046: number;
  CC045: number;
  CC051: number;
  CC006: number;
  CC005: number;
  GH310: number;
  MC512: number;
  G736: number;
  HP94: number;
  CH044: number;
  GH447: number;
  GH529: number;
  CC022: number;
  GH542: number;
  R875: number;
  NH015: number;
  NH066: number;
  R898S: number;
  P57: number;
  NH019: number;
  GH688: number;
  GH717: number;
  GH718: number;
  GH735: number;
  GH713: number;
  GH713B: number;
  R940: number;
  R941: number;
  R943: number;
  R945: number;
};

const SMALL_FIX_DEF: SmallFixKeys = {
  CH033: _on('CH033'),
  CH024: _on('CH024'),
  GH189: _on('GH189'),
  GH190: _on('GH190'),
  GH186: _on('GH186'),
  GH187: _on('GH187'),
  CH027: _on('CH027'),
  CH029: _on('CH029'),
  CH031: _on('CH031'),
  CH032: _on('CH032'),
  CH023: _on('CH023'),
  GH174: _on('GH174'),
  GH163: _on('GH163'),
  CH026: _on('CH026'),
  E638: _on('E638'),
  DREAD_EVOLVE: _on('DREAD_EVOLVE'),
  BOSS_PORTALS: _on('BOSS_PORTALS'),

  CH036: _on('CH036'),
  CH035: _on('CH035'),
  CH034: _on('CH034'),
  R657: _on('R657'),
  R656: _on('R656'),
  R658: _on('R658'),

  R660: _on('R660'),
  R661: _on('R661'),
  R663: _on('R663'),
  R664: _on('R664'),
  R665: _on('R665'),
  R666: _on('R666'),
  R667: _on('R667'),
  CC013: _on('CC013'),
  CC014: _on('CC014'),
  CC003: _on('CC003'),
  CC008: _on('CC008'),
  CC004: _on('CC004'),
  CC010: _on('CC010'),
  CC011: _on('CC011'),
  CC049: _on('CC049'),
  CC050: _on('CC050'),
  CC035: _on('CC035'),
  CC044: _on('CC044'),
  CC012: _on('CC012'),
  CC021: _on('CC021'),
  CC024: _on('CC024'),
  CC026: _on('CC026'),
  CC023: _on('CC023'),
  CC030: _on('CC030'),
  CC031: _on('CC031'),
  CC028: _on('CC028'),
  CC029: _on('CC029'),
  CC032: _on('CC032'),
  CC033: _on('CC033'),
  CC034: _on('CC034'),
  CC043: _on('CC043'),
  CC041: _on('CC041'),
  CC009: _on('CC009'),
  CH045: _on('CH045'),
  CH046: _on('CH046'),
  CH047: _on('CH047'),
  CH039: _on('CH039'),
  CC039: _on('CC039'),
  CC040: _on('CC040'),
  R741: _on('R741'),
  R742: _on('R742'),
  R744: _on('R744'),
  R751: _on('R751'),
  R752: _on('R752'),
  R752B: _on('R752B'),
  R753: _on('R753'),
  R754: _on('R754'),
  R755: _on('R755'),
  GH311: _on('GH311'),
  GH317: _on('GH317'),
  GH320: _on('GH320'),
  GH326: _on('GH326'),
  GH312: _on('GH312'),
  GH307: _on('GH307'),
  GH319: _on('GH319'),
  GH324: _on('GH324'),
  GH313: _on('GH313'),
  GH314: _on('GH314'),
  GH315: _on('GH315'),
  GH316: _on('GH316'),
  GH321: _on('GH321'),
  GH318: _on('GH318'),
  GH308: _on('GH308'),
  GH309: _on('GH309'),
  GH322: _on('GH322'),
  GH323: _on('GH323'),
  GH285: _on('GH285'),
  GH286: _on('GH286'),
  GH288: _on('GH288'),
  GH289: _on('GH289'),
  GH290: _on('GH290'),
  GH291: _on('GH291'),
  GH293: _on('GH293'),
  GH294: _on('GH294'),
  GH295: _on('GH295'),
  GH296: _on('GH296'),
  GH298: _on('GH298'),
  GH299: _on('GH299'),
  GH300: _on('GH300'),
  GH301: _on('GH301'),
  GH304: _on('GH304'),
  GH305: _on('GH305'),
  GH306: _on('GH306'),
  GH292: _on('GH292'),
  GH297: _on('GH297'),
  GH008: _on('GH008'),
  GH009: _on('GH009'),
  GH010: _on('GH010'),
  GH011: _on('GH011'),
  GH085: _on('GH085'),
  GH162: _on('GH162'),
  CC020: _on('CC020'),
  GH302: _on('GH302'),
  GH303: _on('GH303'),
  NH070: _on('NH070'),
  R708: _on('R708'),
  GH096: _on('GH096'),
  CRASH_ARRAS: _on('CRASH_ARRAS'),
  GH006: _on('GH006'),
  GH014: _on('GH014'),
  R669: _on('R669'),
  GH331: _on('GH331'),
  GH324B: _on('GH324B'),
  GH327: _on('GH327'),
  GH328: _on('GH328'),
  R292: _on('R292'),
  R301: _on('R301'),
  R564: _on('R564'),
  GH329: _on('GH329'),
  CC007: _on('CC007'),
  CC025: _on('CC025'),
  R161: _on('R161'),
  R633: _on('R633'),
  R633B: _on('R633B'),
  R9TP: _on('R9TP'),
  NH076: _on('NH076'),
  NH036: _on('NH036'),
  R213: _on('R213'),
  R209: _on('R209'),
  R173F: _on('R173F'),
  R139C: _on('R139C'),
  R139D: _on('R139D'),
  R148F: _on('R148F'),
  R148H: _on('R148H'),
  R148K: _on('R148K'),
  R148O: _on('R148O'),
  R148D: _on('R148D'),
  R148A: _on('R148A'),
  R157C: _on('R157C'),
  GH337: _on('GH337'),
  GH337B: _on('GH337B'),
  GH338: _on('GH338'),
  GH336: _on('GH336'),
  GH332: _on('GH332'),
  GH333: _on('GH333'),
  GH335: _on('GH335'),
  BH73: _on('BH73'),
  BH50: _on('BH50'),
  BH54: _on('BH54'),
  BH76: _on('BH76'),
  BH09: _on('BH09'),
  R146E: _on('R146E'),
  ROCK_IDX: _on('ROCK_IDX'),
  BT_SHAPE_IDX: _on('BT_SHAPE_IDX'),
  GH284: _on('GH284'),
  NH034: _on('NH034'),
  HASH_BOUND: _on('HASH_BOUND'),
  SHAPE_HASH_BOUND: _on('SHAPE_HASH_BOUND'),
  R774D: _on('R774D'),
  R766: _on('R766'),
  R766B: _on('R766B'),
  R772: _on('R772'),
  R775: _on('R775'),
  R776: _on('R776'),
  R765: _on('R765'),
  R767: _on('R767'),
  R771: _on('R771'),
  R768: _on('R768'),
  R769: _on('R769'),
  R770: _on('R770'),
  R773: _on('R773'),
  R766C: _on('R766C'),
  GH339: _on('GH339'),
  GH347: _on('GH347'),
  GH349: _on('GH349'),
  GH340: _on('GH340'),
  GH342: _on('GH342'),
  GH341: _on('GH341'),
  GH344: _on('GH344'),
  GH348: _on('GH348'),
  GH346: _on('GH346'),
  GH139: _on('GH139'),
  R781: _on('R781'),
  R783: _on('R783'),
  R784: _on('R784'),
  R785: _on('R785'),
  R786: _on('R786'),
  R790: _on('R790'),
  R791: _on('R791'),
  R782: _on('R782'),
  R787: _on('R787'),
  R788: _on('R788'),
  R789: _on('R789'),
  R792: _on('R792'),
  R793: _on('R793'),
  R794: _on('R794'),
  R796: _on('R796'),
  R795: _on('R795'),
  R797: _on('R797'),
  R798: _on('R798'),
  R799: _on('R799'),
  R800: _on('R800'),
  R801: _on('R801'),
  R802: _on('R802'),
  R806: _on('R806'),
  R808: _on('R808'),
  R803: _on('R803'),
  R804: _on('R804'),
  R805: _on('R805'),
  R807: _on('R807'),
  R809: _on('R809'),
  R810: _on('R810'),
  R811: _on('R811'),
  R812: _on('R812'),
  R813: _on('R813'),
  R814: _on('R814'),
  R815: _on('R815'),
  R816: _on('R816'),
  R817: _on('R817'),
  R818: _on('R818'),
  R819: _on('R819'),
  R820: _on('R820'),
  R821: _on('R821'),
  R822: _on('R822'),
  R833A: _on('R833A'),
  R853: _on('R853'),
  R855: _on('R855'),
  R855M: _on('R855M'),
  R857: _on('R857'),
  R856P: _on('R856P'),
  R868: _on('R868'),
  GH369: _on('GH369'),
  GH376: _on('GH376'),
  GH436: _on('GH436'),
  GH390: _on('GH390'),
  GH404: _on('GH404'),
  GH412: _on('GH412'),
  GH437: _on('GH437'),
  GH451: _on('GH451'),
  GH360: _on('GH360'),
  GH361: _on('GH361'),
  GH365: _on('GH365'),
  GH367: _on('GH367'),
  GH368: _on('GH368'),
  GH363: _on('GH363'),
  GH370: _on('GH370'),
  GH371: _on('GH371'),
  GH374: _on('GH374'),
  GH372: _on('GH372'),
  GH373: _on('GH373'),
  GH366: _on('GH366'),
  GH384: _on('GH384'),
  GH379: _on('GH379'),
  GH380: _on('GH380'),
  GH491: _on('GH491'),
  GH381: _on('GH381'),
  GH383: _on('GH383'),
  GH387: _on('GH387'),
  GH388: _on('GH388'),
  GH402: _on('GH402'),
  GH403: _on('GH403'),
  GH394: _on('GH394'),
  GH389: _on('GH389'),
  GH405: _on('GH405'),
  GH406: _on('GH406'),
  GH408: _on('GH408'),
  GH413: _on('GH413'),
  GH414: _on('GH414'),
  GH416: _on('GH416'),
  GH466: _on('GH466'),
  GH496: _on('GH496'),
  GH417: _on('GH417'),
  GH418: _on('GH418'),
  GH421: _on('GH421'),
  GH434: _on('GH434'),
  GH426: _on('GH426'),
  GH427: _on('GH427'),
  GH473: _on('GH473'),
  GH457: _on('GH457'),
  GH441: _on('GH441'),
  GH440: _on('GH440'),
  GH438: _on('GH438'),
  GH480: _on('GH480'),
  GH485: _on('GH485'),
  GH484: _on('GH484'),
  GH535: _on('GH535'),
  GH375: _on('GH375'),
  GH540: _on('GH540'),
  GH541: _on('GH541'),
  GH377: _on('GH377'),
  GH410: _on('GH410'),
  GH409: _on('GH409'),
  GH439: _on('GH439'),
  GH512: _on('GH512'),
  GH432: _on('GH432'),
  GH433: _on('GH433'),
  GH479: _on('GH479'),
  GH453: _on('GH453'),
  GH455: _on('GH455'),
  R872: _on('R872'),
  GH490: _on('GH490'),
  GH504: _on('GH504'),
  GH476: _on('GH476'),
  GH505: _on('GH505'),
  GH516: _on('GH516'),
  GH400: _on('GH400'),
  GH527: _on('GH527'),
  GH401: _on('GH401'),
  GH525: _on('GH525'),
  GH449: _on('GH449'),
  GH465: _on('GH465'),
  GH470: _on('GH470'),
  GH472: _on('GH472'),
  GH515: _on('GH515'),
  GH495: _on('GH495'),
  GH364: _on('GH364'),
  GH444: _on('GH444'),
  GH445: _on('GH445'),
  GH399: _on('GH399'),
  GH423: _on('GH423'),
  GH469: _on('GH469'),
  R873: _on('R873'),
  GH482: _on('GH482'),
  GH493: _on('GH493'),
  GH393: _on('GH393'),
  GH456: _on('GH456'),
  GH429: _on('GH429'),
  GH499: _on('GH499'),
  GH498: _on('GH498'),
  GH507: _on('GH507'),
  GH509: _on('GH509'),
  GH514: _on('GH514'),
  GH474: _on('GH474'),
  GH494: _on('GH494'),
  GH481: _on('GH481'),
  GH518: _on('GH518'),
  GH517: _on('GH517'),
  GH506: _on('GH506'),
  GH537: _on('GH537'),
  GH508: _on('GH508'),
  GH519: _on('GH519'),
  GH502: _on('GH502'),
  GH511: _on('GH511'),
  GH487: _on('GH487'),
  GH355: _on('GH355'),
  GH425: _on('GH425'),
  GH459: _on('GH459'),
  GH475: _on('GH475'),
  GH510: _on('GH510'),
  GH391: _on('GH391'),
  GH392: _on('GH392'),
  GH522: _on('GH522'),
  GH500: _on('GH500'),
  GH492: _on('GH492'),
  GH420: _on('GH420'),
  GH471: _on('GH471'),
  GH467: _on('GH467'),
  GH397: _on('GH397'),
  GH422: _on('GH422'),
  GH452: _on('GH452'),
  GH524: _on('GH524'),
  GH362: _on('GH362'),
  GH419: _on('GH419'),
  GH450: _on('GH450'),
  GH350: _on('GH350'),
  GH523: _on('GH523'),
  GH462: _on('GH462'),
  GH454: _on('GH454'),
  GH428: _on('GH428'),
  GH407: _on('GH407'),
  GH458: _on('GH458'),
  GH461: _on('GH461'),
  GH513: _on('GH513'),
  GH489: _on('GH489'),
  GH352: _on('GH352'),
  GH356: _on('GH356'),
  GH357: _on('GH357'),
  GH520: _on('GH520'),
  GH353: _on('GH353'),
  GH359: _on('GH359'),
  GH382: _on('GH382'),
  GH460: _on('GH460'),
  GH463: _on('GH463'),
  GH503: _on('GH503'),
  GH431: _on('GH431'),
  GH497: _on('GH497'),
  GH378: _on('GH378'),
  GH430: _on('GH430'),
  GH488: _on('GH488'),
  GH442: _on('GH442'),
  GH446: _on('GH446'),
  GH415: _on('GH415'),
  GH544: _on('GH544'),
  GH354: _on('GH354'),
  GH468: _on('GH468'),
  GH531: _on('GH531'),
  GH351: _on('GH351'),
  GH464: _on('GH464'),
  GH443: _on('GH443'),
  GH358: _on('GH358'),
  R823: _on('R823'),
  R824: _on('R824'),
  R825: _on('R825'),
  R826: _on('R826'),
  R827: _on('R827'),
  R829: _on('R829'),
  R830: _on('R830'),
  R831: _on('R831'),
  R832: _on('R832'),
  GH386: _on('GH386'),
  GH396: _on('GH396'),
  GH435: _on('GH435'),
  GH385: _on('GH385'),
  GH483: _on('GH483'),
  R859: _on('R859'),
  R889: _on('R889'),
  R889B: _on('R889B'),
  GH548: _on('GH548'),
  GH574: _on('GH574'),
  GH585: _on('GH585'),
  GH592: _on('GH592'),
  GH609: _on('GH609'),
  GH611: _on('GH611'),
  R897: _on('R897'),
  GH610: _on('GH610'),
  GH637: _on('GH637'),
  R899: _on('R899'),
  GH411: _on('GH411'),
  R900: _on('R900'),
  GH547: _on('GH547'),
  GH564: _on('GH564'),
  GH573: _on('GH573'),
  GH549: _on('GH549'),
  GH550: _on('GH550'),
  GH551: _on('GH551'),
  GH556: _on('GH556'),
  GH567: _on('GH567'),
  GH557: _on('GH557'),
  GH565: _on('GH565'),
  GH575: _on('GH575'),
  GH555: _on('GH555'),
  GH566: _on('GH566'),
  GH572: _on('GH572'),
  GH554: _on('GH554'),
  GH568: _on('GH568'),
  GH569: _on('GH569'),
  GH596: _on('GH596'),
  GH597: _on('GH597'),
  GH593: _on('GH593'),
  GH594: _on('GH594'),
  GH623: _on('GH623'),
  GH622: _on('GH622'),
  GH625: _on('GH625'),
  GH626: _on('GH626'),
  GH595: _on('GH595'),
  GH545: _on('GH545'),
  GH600: _on('GH600'),
  GH601: _on('GH601'),
  GH602: _on('GH602'),
  GH620: _on('GH620'),
  GH621: _on('GH621'),
  GH603: _on('GH603'),
  GH617: _on('GH617'),
  GH560: _on('GH560'),
  GH627: _on('GH627'),
  GH571: _on('GH571'),
  GH583: _on('GH583'),
  GH587: _on('GH587'),
  GH590: _on('GH590'),
  GH591: _on('GH591'),
  GH628: _on('GH628'),
  GH612: _on('GH612'),
  GH598: _on('GH598'),
  GH584: _on('GH584'),
  GH586: _on('GH586'),
  GH614: _on('GH614'),
  GH559: _on('GH559'),
  GH561: _on('GH561'),
  GH562: _on('GH562'),
  GH563: _on('GH563'),
  GH578: _on('GH578'),
  GH616: _on('GH616'),
  GH634: _on('GH634'),
  GH631: _on('GH631'),
  GH589: _on('GH589'),
  GH599: _on('GH599'),
  GH619: _on('GH619'),
  GH615: _on('GH615'),
  GH635: _on('GH635'),
  GH604: _on('GH604'),
  GH605: _on('GH605'),
  GH607: _on('GH607'),
  GH618: _on('GH618'),
  GH636: _on('GH636'),
  GH632: _on('GH632'),
  GH633: _on('GH633'),
  GH624: _on('GH624'),
  GH553: _on('GH553'),
  GH579: _on('GH579'),
  GH552: _on('GH552'),
  GH576: _on('GH576'),
  GH448: _on('GH448'),
  GH532: _on('GH532'),
  GH398: _on('GH398'),
  GH536: _on('GH536'),
  GH533: _on('GH533'),
  GH539: _on('GH539'),
  GH629: _on('GH629'),
  GH630: _on('GH630'),
  GH588: _on('GH588'),
  GH538: _on('GH538'),
  GH534: _on('GH534'),
  GH530: _on('GH530'),
  GH582: _on('GH582'),
  GH486: _on('GH486'),
  R903: _on('R903'),
  R904: _on('R904'),
  R906: _on('R906'),
  R887: _on('R887'),
  R884: _on('R884'),
  R885: _on('R885'),
  R883: _on('R883'),
  R876: _on('R876'),
  R886: _on('R886'),
  R882: _on('R882'),
  R879: _on('R879'),
  R880: _on('R880'),
  R881: _on('R881'),
  R902: _on('R902'),
  GH577: _on('GH577'),
  GH581: _on('GH581'),
  GH608: _on('GH608'),
  R927: _on('R927'),
  CC001: _on('CC001'),
  CC027: _on('CC027'),
  CC036: _on('CC036'),
  CC037: _on('CC037'),
  CC053: _on('CC053'),
  NH013: _on('NH013'),
  NH067: _on('NH067'),
  CC048: _on('CC048'),
  CC018: _on('CC018'),
  CC017: _on('CC017'),
  GH543: _on('GH543'),
  GH325: _on('GH325'),
  BH04: _on('BH04'),
  R13: _on('R13'),
  R936: _on('R936'),
  G638: _on('G638'),
  G639: _on('G639'),
  G640: _on('G640'),
  G704: _on('G704'),
  G641: _on('G641'),
  G678: _on('G678'),
  G705: _on('G705'),
  G665: _on('G665'),
  G689: _on('G689'),
  G690: _on('G690'),
  G652: _on('G652'),
  G653: _on('G653'),
  G654: _on('G654'),
  G644: _on('G644'),
  G646: _on('G646'),
  G649: _on('G649'),
  G686: _on('G686'),
  G685: _on('G685'),
  G687: _on('G687'),
  G691: _on('G691'),
  G669: _on('G669'),
  G672: _on('G672'),
  G679: _on('G679'),
  G680: _on('G680'),
  G681: _on('G681'),
  G682: _on('G682'),
  G683: _on('G683'),
  G709: _on('G709'),
  G711: _on('G711'),
  G719: _on('G719'),
  G703: _on('G703'),
  G706: _on('G706'),
  G694: _on('G694'),
  G692: _on('G692'),
  G700: _on('G700'),
  G710: _on('G710'),
  G733: _on('G733'),
  G647: _on('G647'),
  G648: _on('G648'),
  G707: _on('G707'),
  G661: _on('G661'),
  G662: _on('G662'),
  G701: _on('G701'),
  G664: _on('G664'),
  G670: _on('G670'),
  G698: _on('G698'),
  G673: _on('G673'),
  G675: _on('G675'),
  G677: _on('G677'),
  G696: _on('G696'),
  G697: _on('G697'),
  G714: _on('G714'),
  G716: _on('G716'),
  G732: _on('G732'),
  R896: _on('R896'),
  G674: _on('G674'),
  G724: _on('G724'),
  G712: _on('G712'),
  G702: _on('G702'),
  G721: _on('G721'),
  G606: _on('G606'),
  G613: _on('G613'),
  R895: _on('R895'),
  R898: _on('R898'),
  G720: _on('G720'),
  R939: _on('R939'),
  R907: _on('R907'),
  R908: _on('R908'),
  R909: _on('R909'),
  R910: _on('R910'),
  R911: _on('R911'),
  R912: _on('R912'),
  R913: _on('R913'),
  R914: _on('R914'),
  G645: _on('G645'),
  G650: _on('G650'),
  G722: _on('G722'),
  G708: _on('G708'),
  G655: _on('G655'),
  G656: _on('G656'),
  G657: _on('G657'),
  G666: _on('G666'),
  G667: _on('G667'),
  G725: _on('G725'),
  G727: _on('G727'),
  G734: _on('G734'),
  G728: _on('G728'),
  G660: _on('G660'),
  G726: _on('G726'),
  G659: _on('G659'),
  G663: _on('G663'),
  G668: _on('G668'),
  G699: _on('G699'),
  G715: _on('G715'),
  G676: _on('G676'),
  G723: _on('G723'),
  G730: _on('G730'),
  G729: _on('G729'),
  G731: _on('G731'),
  CC002: _on('CC002'),
  NH065: _on('NH065'),
  CC042: _on('CC042'),
  NH059: _on('NH059'),
  NH069: _on('NH069'),
  NH055: _on('NH055'),
  GH145: _on('GH145'),
  CC054: _on('CC054'),
  R934: _on('R934'),
  R107: _on('R107'),
  R120: _on('R120'),
  CC047: _on('CC047'),
  CC052: _on('CC052'),
  GH580: _on('GH580'),
  NH062: _on('NH062'),
  NH064: _on('NH064'),
  NH014: _on('NH014'),
  CC046: _on('CC046'),
  CC045: _on('CC045'),
  CC051: _on('CC051'),
  CC006: _on('CC006'),
  CC005: _on('CC005'),
  GH310: _on('GH310'),
  MC512: _on('MC512'),
  G736: _on('G736'),
  HP94: _on('HP94'),
  CH044: _on('CH044'),
  GH447: _on('GH447'),
  GH529: _on('GH529'),
  CC022: _on('CC022'),
  GH542: _on('GH542'),
  R875: _on('R875'),
  NH015: _on('NH015'),
  NH066: _on('NH066'),
  R898S: _on('R898S'),
  P57: _on('P57'),
  NH019: _on('NH019'),
  GH688: _on('GH688'),
  GH717: _on('GH717'),
  GH718: _on('GH718'),
  GH735: _on('GH735'),
  GH713: _on('GH713'),
  GH713B: _on('GH713B'),
  R940: _on('R940'),
  R941: _on('R941'),
  R943: _on('R943'),
  R945: _on('R945'),
};

function SmallFixShell(this: SmallFixKeys, d: SmallFixKeys): void {
  this.CH033 = d.CH033;
  this.CH024 = d.CH024;
  this.GH189 = d.GH189;
  this.GH190 = d.GH190;
  this.GH186 = d.GH186;
  this.GH187 = d.GH187;
  this.CH027 = d.CH027;
  this.CH029 = d.CH029;
  this.CH031 = d.CH031;
  this.CH032 = d.CH032;
  this.CH023 = d.CH023;
  this.GH174 = d.GH174;
  this.GH163 = d.GH163;
  this.CH026 = d.CH026;
  this.E638 = d.E638;
  this.DREAD_EVOLVE = d.DREAD_EVOLVE;
  this.BOSS_PORTALS = d.BOSS_PORTALS;
  this.CH036 = d.CH036;
  this.CH035 = d.CH035;
  this.CH034 = d.CH034;
  this.R657 = d.R657;
  this.R656 = d.R656;
  this.R658 = d.R658;
  this.R660 = d.R660;
  this.R661 = d.R661;
  this.R663 = d.R663;
  this.R664 = d.R664;
  this.R665 = d.R665;
  this.R666 = d.R666;
  this.R667 = d.R667;
  this.CC013 = d.CC013;
  this.CC014 = d.CC014;
  this.CC003 = d.CC003;
  this.CC008 = d.CC008;
  this.CC004 = d.CC004;
  this.CC010 = d.CC010;
  this.CC011 = d.CC011;
  this.CC049 = d.CC049;
  this.CC050 = d.CC050;
  this.CC035 = d.CC035;
  this.CC044 = d.CC044;
  this.CC012 = d.CC012;
  this.CC021 = d.CC021;
  this.CC024 = d.CC024;
  this.CC026 = d.CC026;
  this.CC023 = d.CC023;
  this.CC030 = d.CC030;
  this.CC031 = d.CC031;
  this.CC028 = d.CC028;
  this.CC029 = d.CC029;
  this.CC032 = d.CC032;
  this.CC033 = d.CC033;
  this.CC034 = d.CC034;
  this.CC043 = d.CC043;
  this.CC041 = d.CC041;
  this.CC009 = d.CC009;
  this.CH045 = d.CH045;
  this.CH046 = d.CH046;
  this.CH047 = d.CH047;
  this.CH039 = d.CH039;
  this.CC039 = d.CC039;
  this.CC040 = d.CC040;
  this.R741 = d.R741;
  this.R742 = d.R742;
  this.R744 = d.R744;
  this.R751 = d.R751;
  this.R752 = d.R752;
  this.R752B = d.R752B;
  this.R753 = d.R753;
  this.R754 = d.R754;
  this.R755 = d.R755;
  this.GH311 = d.GH311;
  this.GH317 = d.GH317;
  this.GH320 = d.GH320;
  this.GH326 = d.GH326;
  this.GH312 = d.GH312;
  this.GH307 = d.GH307;
  this.GH319 = d.GH319;
  this.GH324 = d.GH324;
  this.GH313 = d.GH313;
  this.GH314 = d.GH314;
  this.GH315 = d.GH315;
  this.GH316 = d.GH316;
  this.GH321 = d.GH321;
  this.GH318 = d.GH318;
  this.GH308 = d.GH308;
  this.GH309 = d.GH309;
  this.GH322 = d.GH322;
  this.GH323 = d.GH323;
  this.GH285 = d.GH285;
  this.GH286 = d.GH286;
  this.GH288 = d.GH288;
  this.GH289 = d.GH289;
  this.GH290 = d.GH290;
  this.GH291 = d.GH291;
  this.GH293 = d.GH293;
  this.GH294 = d.GH294;
  this.GH295 = d.GH295;
  this.GH296 = d.GH296;
  this.GH298 = d.GH298;
  this.GH299 = d.GH299;
  this.GH300 = d.GH300;
  this.GH301 = d.GH301;
  this.GH304 = d.GH304;
  this.GH305 = d.GH305;
  this.GH306 = d.GH306;
  this.GH292 = d.GH292;
  this.GH297 = d.GH297;
  this.GH008 = d.GH008;
  this.GH009 = d.GH009;
  this.GH010 = d.GH010;
  this.GH011 = d.GH011;
  this.GH085 = d.GH085;
  this.GH162 = d.GH162;
  this.CC020 = d.CC020;
  this.GH302 = d.GH302;
  this.GH303 = d.GH303;
  this.NH070 = d.NH070;
  this.R708 = d.R708;
  this.GH096 = d.GH096;
  this.CRASH_ARRAS = d.CRASH_ARRAS;
  this.GH006 = d.GH006;
  this.GH014 = d.GH014;
  this.R669 = d.R669;
  this.GH331 = d.GH331;
  this.GH324B = d.GH324B;
  this.GH327 = d.GH327;
  this.GH328 = d.GH328;
  this.R292 = d.R292;
  this.R301 = d.R301;
  this.R564 = d.R564;
  this.GH329 = d.GH329;
  this.CC007 = d.CC007;
  this.CC025 = d.CC025;
  this.R161 = d.R161;
  this.R633 = d.R633;
  this.R633B = d.R633B;
  this.R9TP = d.R9TP;
  this.NH076 = d.NH076;
  this.NH036 = d.NH036;
  this.R213 = d.R213;
  this.R209 = d.R209;
  this.R173F = d.R173F;
  this.R139C = d.R139C;
  this.R139D = d.R139D;
  this.R148F = d.R148F;
  this.R148H = d.R148H;
  this.R148K = d.R148K;
  this.R148O = d.R148O;
  this.R148D = d.R148D;
  this.R148A = d.R148A;
  this.R157C = d.R157C;
  this.GH337 = d.GH337;
  this.GH337B = d.GH337B;
  this.GH338 = d.GH338;
  this.GH336 = d.GH336;
  this.GH332 = d.GH332;
  this.GH333 = d.GH333;
  this.GH335 = d.GH335;
  this.BH73 = d.BH73;
  this.BH50 = d.BH50;
  this.BH54 = d.BH54;
  this.BH76 = d.BH76;
  this.BH09 = d.BH09;
  this.R146E = d.R146E;
  this.ROCK_IDX = d.ROCK_IDX;
  this.BT_SHAPE_IDX = d.BT_SHAPE_IDX;
  this.GH284 = d.GH284;
  this.NH034 = d.NH034;
  this.HASH_BOUND = d.HASH_BOUND;
  this.SHAPE_HASH_BOUND = d.SHAPE_HASH_BOUND;
  this.R774D = d.R774D;
  this.R766 = d.R766;
  this.R766B = d.R766B;
  this.R772 = d.R772;
  this.R775 = d.R775;
  this.R776 = d.R776;
  this.R765 = d.R765;
  this.R767 = d.R767;
  this.R771 = d.R771;
  this.R768 = d.R768;
  this.R769 = d.R769;
  this.R770 = d.R770;
  this.R773 = d.R773;
  this.R766C = d.R766C;
  this.GH339 = d.GH339;
  this.GH347 = d.GH347;
  this.GH349 = d.GH349;
  this.GH340 = d.GH340;
  this.GH342 = d.GH342;
  this.GH341 = d.GH341;
  this.GH344 = d.GH344;
  this.GH348 = d.GH348;
  this.GH346 = d.GH346;
  this.GH139 = d.GH139;
  this.R781 = d.R781;
  this.R783 = d.R783;
  this.R784 = d.R784;
  this.R785 = d.R785;
  this.R786 = d.R786;
  this.R790 = d.R790;
  this.R791 = d.R791;
  this.R782 = d.R782;
  this.R787 = d.R787;
  this.R788 = d.R788;
  this.R789 = d.R789;
  this.R792 = d.R792;
  this.R793 = d.R793;
  this.R794 = d.R794;
  this.R796 = d.R796;
  this.R795 = d.R795;
  this.R797 = d.R797;
  this.R798 = d.R798;
  this.R799 = d.R799;
  this.R800 = d.R800;
  this.R801 = d.R801;
  this.R802 = d.R802;
  this.R806 = d.R806;
  this.R808 = d.R808;
  this.R803 = d.R803;
  this.R804 = d.R804;
  this.R805 = d.R805;
  this.R807 = d.R807;
  this.R809 = d.R809;
  this.R810 = d.R810;
  this.R811 = d.R811;
  this.R812 = d.R812;
  this.R813 = d.R813;
  this.R814 = d.R814;
  this.R815 = d.R815;
  this.R816 = d.R816;
  this.R817 = d.R817;
  this.R818 = d.R818;
  this.R819 = d.R819;
  this.R820 = d.R820;
  this.R821 = d.R821;
  this.R822 = d.R822;
  this.R833A = d.R833A;
  this.R853 = d.R853;
  this.R855 = d.R855;
  this.R855M = d.R855M;
  this.R857 = d.R857;
  this.R856P = d.R856P;
  this.R868 = d.R868;
  this.GH369 = d.GH369;
  this.GH376 = d.GH376;
  this.GH436 = d.GH436;
  this.GH390 = d.GH390;
  this.GH404 = d.GH404;
  this.GH412 = d.GH412;
  this.GH437 = d.GH437;
  this.GH451 = d.GH451;
  this.GH360 = d.GH360;
  this.GH361 = d.GH361;
  this.GH365 = d.GH365;
  this.GH367 = d.GH367;
  this.GH368 = d.GH368;
  this.GH363 = d.GH363;
  this.GH370 = d.GH370;
  this.GH371 = d.GH371;
  this.GH374 = d.GH374;
  this.GH372 = d.GH372;
  this.GH373 = d.GH373;
  this.GH366 = d.GH366;
  this.GH384 = d.GH384;
  this.GH379 = d.GH379;
  this.GH380 = d.GH380;
  this.GH491 = d.GH491;
  this.GH381 = d.GH381;
  this.GH383 = d.GH383;
  this.GH387 = d.GH387;
  this.GH388 = d.GH388;
  this.GH402 = d.GH402;
  this.GH403 = d.GH403;
  this.GH394 = d.GH394;
  this.GH389 = d.GH389;
  this.GH405 = d.GH405;
  this.GH406 = d.GH406;
  this.GH408 = d.GH408;
  this.GH413 = d.GH413;
  this.GH414 = d.GH414;
  this.GH416 = d.GH416;
  this.GH466 = d.GH466;
  this.GH496 = d.GH496;
  this.GH417 = d.GH417;
  this.GH418 = d.GH418;
  this.GH421 = d.GH421;
  this.GH434 = d.GH434;
  this.GH426 = d.GH426;
  this.GH427 = d.GH427;
  this.GH473 = d.GH473;
  this.GH457 = d.GH457;
  this.GH441 = d.GH441;
  this.GH440 = d.GH440;
  this.GH438 = d.GH438;
  this.GH480 = d.GH480;
  this.GH485 = d.GH485;
  this.GH484 = d.GH484;
  this.GH535 = d.GH535;
  this.GH375 = d.GH375;
  this.GH540 = d.GH540;
  this.GH541 = d.GH541;
  this.GH377 = d.GH377;
  this.GH410 = d.GH410;
  this.GH409 = d.GH409;
  this.GH439 = d.GH439;
  this.GH512 = d.GH512;
  this.GH432 = d.GH432;
  this.GH433 = d.GH433;
  this.GH479 = d.GH479;
  this.GH453 = d.GH453;
  this.GH455 = d.GH455;
  this.R872 = d.R872;
  this.GH490 = d.GH490;
  this.GH504 = d.GH504;
  this.GH476 = d.GH476;
  this.GH505 = d.GH505;
  this.GH516 = d.GH516;
  this.GH400 = d.GH400;
  this.GH527 = d.GH527;
  this.GH401 = d.GH401;
  this.GH525 = d.GH525;
  this.GH449 = d.GH449;
  this.GH465 = d.GH465;
  this.GH470 = d.GH470;
  this.GH472 = d.GH472;
  this.GH515 = d.GH515;
  this.GH495 = d.GH495;
  this.GH364 = d.GH364;
  this.GH444 = d.GH444;
  this.GH445 = d.GH445;
  this.GH399 = d.GH399;
  this.GH423 = d.GH423;
  this.GH469 = d.GH469;
  this.R873 = d.R873;
  this.GH482 = d.GH482;
  this.GH493 = d.GH493;
  this.GH393 = d.GH393;
  this.GH456 = d.GH456;
  this.GH429 = d.GH429;
  this.GH499 = d.GH499;
  this.GH498 = d.GH498;
  this.GH507 = d.GH507;
  this.GH509 = d.GH509;
  this.GH514 = d.GH514;
  this.GH474 = d.GH474;
  this.GH494 = d.GH494;
  this.GH481 = d.GH481;
  this.GH518 = d.GH518;
  this.GH517 = d.GH517;
  this.GH506 = d.GH506;
  this.GH537 = d.GH537;
  this.GH508 = d.GH508;
  this.GH519 = d.GH519;
  this.GH502 = d.GH502;
  this.GH511 = d.GH511;
  this.GH487 = d.GH487;
  this.GH355 = d.GH355;
  this.GH425 = d.GH425;
  this.GH459 = d.GH459;
  this.GH475 = d.GH475;
  this.GH510 = d.GH510;
  this.GH391 = d.GH391;
  this.GH392 = d.GH392;
  this.GH522 = d.GH522;
  this.GH500 = d.GH500;
  this.GH492 = d.GH492;
  this.GH420 = d.GH420;
  this.GH471 = d.GH471;
  this.GH467 = d.GH467;
  this.GH397 = d.GH397;
  this.GH422 = d.GH422;
  this.GH452 = d.GH452;
  this.GH524 = d.GH524;
  this.GH362 = d.GH362;
  this.GH419 = d.GH419;
  this.GH450 = d.GH450;
  this.GH350 = d.GH350;
  this.GH523 = d.GH523;
  this.GH462 = d.GH462;
  this.GH454 = d.GH454;
  this.GH428 = d.GH428;
  this.GH407 = d.GH407;
  this.GH458 = d.GH458;
  this.GH461 = d.GH461;
  this.GH513 = d.GH513;
  this.GH489 = d.GH489;
  this.GH352 = d.GH352;
  this.GH356 = d.GH356;
  this.GH357 = d.GH357;
  this.GH520 = d.GH520;
  this.GH353 = d.GH353;
  this.GH359 = d.GH359;
  this.GH382 = d.GH382;
  this.GH460 = d.GH460;
  this.GH463 = d.GH463;
  this.GH503 = d.GH503;
  this.GH431 = d.GH431;
  this.GH497 = d.GH497;
  this.GH378 = d.GH378;
  this.GH430 = d.GH430;
  this.GH488 = d.GH488;
  this.GH442 = d.GH442;
  this.GH446 = d.GH446;
  this.GH415 = d.GH415;
  this.GH544 = d.GH544;
  this.GH354 = d.GH354;
  this.GH468 = d.GH468;
  this.GH531 = d.GH531;
  this.GH351 = d.GH351;
  this.GH464 = d.GH464;
  this.GH443 = d.GH443;
  this.GH358 = d.GH358;
  this.R823 = d.R823;
  this.R824 = d.R824;
  this.R825 = d.R825;
  this.R826 = d.R826;
  this.R827 = d.R827;
  this.R829 = d.R829;
  this.R830 = d.R830;
  this.R831 = d.R831;
  this.R832 = d.R832;
  this.GH386 = d.GH386;
  this.GH396 = d.GH396;
  this.GH435 = d.GH435;
  this.GH385 = d.GH385;
  this.GH483 = d.GH483;
  this.R859 = d.R859;
  this.R889 = d.R889;
  this.R889B = d.R889B;
  this.GH548 = d.GH548;
  this.GH574 = d.GH574;
  this.GH585 = d.GH585;
  this.GH592 = d.GH592;
  this.GH609 = d.GH609;
  this.GH611 = d.GH611;
  this.R897 = d.R897;
  this.GH610 = d.GH610;
  this.GH637 = d.GH637;
  this.R899 = d.R899;
  this.GH411 = d.GH411;
  this.R900 = d.R900;
  this.GH547 = d.GH547;
  this.GH564 = d.GH564;
  this.GH573 = d.GH573;
  this.GH549 = d.GH549;
  this.GH550 = d.GH550;
  this.GH551 = d.GH551;
  this.GH556 = d.GH556;
  this.GH567 = d.GH567;
  this.GH557 = d.GH557;
  this.GH565 = d.GH565;
  this.GH575 = d.GH575;
  this.GH555 = d.GH555;
  this.GH566 = d.GH566;
  this.GH572 = d.GH572;
  this.GH554 = d.GH554;
  this.GH568 = d.GH568;
  this.GH569 = d.GH569;
  this.GH596 = d.GH596;
  this.GH597 = d.GH597;
  this.GH593 = d.GH593;
  this.GH594 = d.GH594;
  this.GH623 = d.GH623;
  this.GH622 = d.GH622;
  this.GH625 = d.GH625;
  this.GH626 = d.GH626;
  this.GH595 = d.GH595;
  this.GH545 = d.GH545;
  this.GH600 = d.GH600;
  this.GH601 = d.GH601;
  this.GH602 = d.GH602;
  this.GH620 = d.GH620;
  this.GH621 = d.GH621;
  this.GH603 = d.GH603;
  this.GH617 = d.GH617;
  this.GH560 = d.GH560;
  this.GH627 = d.GH627;
  this.GH571 = d.GH571;
  this.GH583 = d.GH583;
  this.GH587 = d.GH587;
  this.GH590 = d.GH590;
  this.GH591 = d.GH591;
  this.GH628 = d.GH628;
  this.GH612 = d.GH612;
  this.GH598 = d.GH598;
  this.GH584 = d.GH584;
  this.GH586 = d.GH586;
  this.GH614 = d.GH614;
  this.GH559 = d.GH559;
  this.GH561 = d.GH561;
  this.GH562 = d.GH562;
  this.GH563 = d.GH563;
  this.GH578 = d.GH578;
  this.GH616 = d.GH616;
  this.GH634 = d.GH634;
  this.GH631 = d.GH631;
  this.GH589 = d.GH589;
  this.GH599 = d.GH599;
  this.GH619 = d.GH619;
  this.GH615 = d.GH615;
  this.GH635 = d.GH635;
  this.GH604 = d.GH604;
  this.GH605 = d.GH605;
  this.GH607 = d.GH607;
  this.GH618 = d.GH618;
  this.GH636 = d.GH636;
  this.GH632 = d.GH632;
  this.GH633 = d.GH633;
  this.GH624 = d.GH624;
  this.GH553 = d.GH553;
  this.GH579 = d.GH579;
  this.GH552 = d.GH552;
  this.GH576 = d.GH576;
  this.GH448 = d.GH448;
  this.GH532 = d.GH532;
  this.GH398 = d.GH398;
  this.GH536 = d.GH536;
  this.GH533 = d.GH533;
  this.GH539 = d.GH539;
  this.GH629 = d.GH629;
  this.GH630 = d.GH630;
  this.GH588 = d.GH588;
  this.GH538 = d.GH538;
  this.GH534 = d.GH534;
  this.GH530 = d.GH530;
  this.GH582 = d.GH582;
  this.GH486 = d.GH486;
  this.R903 = d.R903;
  this.R904 = d.R904;
  this.R906 = d.R906;
  this.R887 = d.R887;
  this.R884 = d.R884;
  this.R885 = d.R885;
  this.R883 = d.R883;
  this.R876 = d.R876;
  this.R886 = d.R886;
  this.R882 = d.R882;
  this.R879 = d.R879;
  this.R880 = d.R880;
  this.R881 = d.R881;
  this.R902 = d.R902;
  this.GH577 = d.GH577;
  this.GH581 = d.GH581;
  this.GH608 = d.GH608;
  this.R927 = d.R927;
  this.CC001 = d.CC001;
  this.CC027 = d.CC027;
  this.CC036 = d.CC036;
  this.CC037 = d.CC037;
  this.CC053 = d.CC053;
  this.NH013 = d.NH013;
  this.NH067 = d.NH067;
  this.CC048 = d.CC048;
  this.CC018 = d.CC018;
  this.CC017 = d.CC017;
  this.GH543 = d.GH543;
  this.GH325 = d.GH325;
  this.BH04 = d.BH04;
  this.R13 = d.R13;
  this.R936 = d.R936;
  this.G638 = d.G638;
  this.G639 = d.G639;
  this.G640 = d.G640;
  this.G704 = d.G704;
  this.G641 = d.G641;
  this.G678 = d.G678;
  this.G705 = d.G705;
  this.G665 = d.G665;
  this.G689 = d.G689;
  this.G690 = d.G690;
  this.G652 = d.G652;
  this.G653 = d.G653;
  this.G654 = d.G654;
  this.G644 = d.G644;
  this.G646 = d.G646;
  this.G649 = d.G649;
  this.G686 = d.G686;
  this.G685 = d.G685;
  this.G687 = d.G687;
  this.G691 = d.G691;
  this.G669 = d.G669;
  this.G672 = d.G672;
  this.G679 = d.G679;
  this.G680 = d.G680;
  this.G681 = d.G681;
  this.G682 = d.G682;
  this.G683 = d.G683;
  this.G709 = d.G709;
  this.G711 = d.G711;
  this.G719 = d.G719;
  this.G703 = d.G703;
  this.G706 = d.G706;
  this.G694 = d.G694;
  this.G692 = d.G692;
  this.G700 = d.G700;
  this.G710 = d.G710;
  this.G733 = d.G733;
  this.G647 = d.G647;
  this.G648 = d.G648;
  this.G707 = d.G707;
  this.G661 = d.G661;
  this.G662 = d.G662;
  this.G701 = d.G701;
  this.G664 = d.G664;
  this.G670 = d.G670;
  this.G698 = d.G698;
  this.G673 = d.G673;
  this.G675 = d.G675;
  this.G677 = d.G677;
  this.G696 = d.G696;
  this.G697 = d.G697;
  this.G714 = d.G714;
  this.G716 = d.G716;
  this.G732 = d.G732;
  this.R896 = d.R896;
  this.G674 = d.G674;
  this.G724 = d.G724;
  this.G712 = d.G712;
  this.G702 = d.G702;
  this.G721 = d.G721;
  this.G606 = d.G606;
  this.G613 = d.G613;
  this.R895 = d.R895;
  this.R898 = d.R898;
  this.G720 = d.G720;
  this.R939 = d.R939;
  this.R907 = d.R907;
  this.R908 = d.R908;
  this.R909 = d.R909;
  this.R910 = d.R910;
  this.R911 = d.R911;
  this.R912 = d.R912;
  this.R913 = d.R913;
  this.R914 = d.R914;
  this.G645 = d.G645;
  this.G650 = d.G650;
  this.G722 = d.G722;
  this.G708 = d.G708;
  this.G655 = d.G655;
  this.G656 = d.G656;
  this.G657 = d.G657;
  this.G666 = d.G666;
  this.G667 = d.G667;
  this.G725 = d.G725;
  this.G727 = d.G727;
  this.G734 = d.G734;
  this.G728 = d.G728;
  this.G660 = d.G660;
  this.G726 = d.G726;
  this.G659 = d.G659;
  this.G663 = d.G663;
  this.G668 = d.G668;
  this.G699 = d.G699;
  this.G715 = d.G715;
  this.G676 = d.G676;
  this.G723 = d.G723;
  this.G730 = d.G730;
  this.G729 = d.G729;
  this.G731 = d.G731;
  this.CC002 = d.CC002;
  this.NH065 = d.NH065;
  this.CC042 = d.CC042;
  this.NH059 = d.NH059;
  this.NH069 = d.NH069;
  this.NH055 = d.NH055;
  this.GH145 = d.GH145;
  this.CC054 = d.CC054;
  this.R934 = d.R934;
  this.R107 = d.R107;
  this.R120 = d.R120;
  this.CC047 = d.CC047;
  this.CC052 = d.CC052;
  this.GH580 = d.GH580;
  this.NH062 = d.NH062;
  this.NH064 = d.NH064;
  this.NH014 = d.NH014;
  this.CC046 = d.CC046;
  this.CC045 = d.CC045;
  this.CC051 = d.CC051;
  this.CC006 = d.CC006;
  this.CC005 = d.CC005;
  this.GH310 = d.GH310;
  this.MC512 = d.MC512;
  this.G736 = d.G736;
  this.HP94 = d.HP94;
  this.CH044 = d.CH044;
  this.GH447 = d.GH447;
  this.GH529 = d.GH529;
  this.CC022 = d.CC022;
  this.GH542 = d.GH542;
  this.R875 = d.R875;
  this.NH015 = d.NH015;
  this.NH066 = d.NH066;
  this.R898S = d.R898S;
  this.P57 = d.P57;
  this.NH019 = d.NH019;
  this.GH688 = d.GH688;
  this.GH717 = d.GH717;
  this.GH718 = d.GH718;
  this.GH735 = d.GH735;
  this.GH713 = d.GH713;
  this.GH713B = d.GH713B;
  this.R940 = d.R940;
  this.R941 = d.R941;
  this.R943 = d.R943;
  this.R945 = d.R945;
}
export const SMALL_FIX: SmallFixKeys = new (SmallFixShell as unknown as { new (d: SmallFixKeys): SmallFixKeys })(SMALL_FIX_DEF);
if (Object.keys(SMALL_FIX).length !== Object.keys(SMALL_FIX_DEF).length) {
  throw new Error('smallFixSwitch: SmallFixShell misses a key of SMALL_FIX_DEF (add its line there)');
}
