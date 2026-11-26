# move2med: Healthcare Hackathon Bayern, Challenge #1 (gematik)

**Digital Patient Transport: From Paper Form to Digital Workflow**

> Let taxi and patient-transport companies, which are **not on Germany's Telematics Infrastructure**, securely read the
> upcoming e-prescription for patient transport, and let patients (often elderly) **confirm the trip** digitally so the
> company can bill the insurer.

## Start here

1. **[docs/challenge/CHALLENGE_EXPLAINED.md](docs/challenge/CHALLENGE_EXPLAINED.md)**: the whole challenge in plain English (actors, today's process, gematik's target process, the 3 questions, scope, demo idea, questions for mentors)
2. [docs/challenge/challenge_slides_transcript.md](docs/challenge/challenge_slides_transcript.md): what was on the 4 slides
3. [data/DATA_DICTIONARY.md](data/DATA_DICTIONARY.md): the mock JSON explained field by field, the 20 scenarios, and the rule conflicts found in it
4. [docs/GLOSSARY.md](docs/GLOSSARY.md): German ↔ English terms

## Layout

```
move2med/
├── README.md
├── data/
│   ├── DATA_DICTIONARY.md
│   ├── raw/update_vollständig_testdatensatz_20.json   # original from organisers (invalid JSON, untouched)
│   └── clean/testdatensatz_20.json                     # repaired, valid. USE THIS
├── scripts/
│   └── repair_json.py                                  # raw → clean (python3, stdlib only)
└── docs/
    ├── challenge/
    │   ├── CHALLENGE_EXPLAINED.md
    │   └── challenge_slides_transcript.md
    ├── translations/                                   # English working translations (unofficial)
    │   ├── impulspapier_EN.md                          # gematik working-group paper (the target process)
    │   ├── muster4_form_guide_EN.md                    # the paper form, every field, front + back
    │   └── gematik_brand_guide_EN.md                   # logo rules + observed colors and fonts
    ├── GLOSSARY.md
    ├── TECH_CONTEXT.md                                 # eRezept token, PoPP, ZETA, WANDA, links
    ├── images/
    │   ├── challenge_slides/                           # photos of the 4 challenge slides
    │   ├── impulspapier_soll_prozess.png               # gematik target-process diagram
    │   ├── muster4_front_numbered.png                  # form front with field numbers ❶–⓱
    │   ├── muster4_official_front.png
    │   └── muster4_official_back.png                   # patient confirmation + billing block
    └── source/                                         # original German documents
        ├── gematik_Impulspapier_Krankentransport.pdf
        ├── gematik_news_impulspapier.html
        ├── KVHH_Krankenbefoerderung_Vordruckerlaeuterungen.pdf
        ├── KBV_Muster4_official_front_back_7-2020.pdf
        └── gematik_Markenleitfaden_Dachmarke.pdf
```

## Using the data

```python
import json
records = json.load(open("data/clean/testdatensatz_20.json", encoding="utf-8"))["testdaten"]
```

Each record = one Muster 4 (front + back) for one synthetic patient, with one scenario each (dialysis, carry chair,
bariatric, proxy signature, …). All data is synthetic.

## Source links

- Challenge provider: gematik, <https://www.gematik.de>, <https://github.com/gematik>, <https://fachportal.gematik.de/>
- Impulspapier: <https://www.gematik.de/newsroom/news-detail/impulspapier-fuer-digitale-verordnung-von-krankenbefoerderung>
- Form explanation (KV Hamburg): <https://www.kvhh.net/_Resources/Persistent/8/5/6/0/85600cd58d37e3eef1dc660cee2da7909097480c/Krankenbefoerdeung-Vordruckerlaeuterungen.pdf>
- Brand guide: <https://www.gematik.de/media/gematik/Medien/Newsroom/Mediaservice/Logo/gematik_Markenleitfaden_Dachmarke_web.pdf>
