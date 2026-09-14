//-------------------------------------------------------------------------------
// Hulpfuncties
//-------------------------------------------------------------------------------

function contains(haystack, needle) {
    if (!haystack || !needle) return false;

    if (Array.isArray(haystack)) {
        return haystack.includes(needle);
    }

    return String(haystack).toLowerCase().includes(String(needle).toLowerCase());
}

function stenoseScore(stenose) {
    switch (stenose) {
        case "<25%": return 1;
        case "25-49%": return 2;
        case "50-69%": return 3;
        case "70-99%": return 4;
        // Ondersteuning voor reeds opgeslagen invoer uit oudere versies.
        case ">70%": return 4;
        case "Occlusie": return 5;
        default: return 0;
    }
}

//-------------------------------------------------------------------------------
// CAD-RADS- en calciumscoreberekening
//-------------------------------------------------------------------------------

EventHandler.OnStateChange = function(get, set, extensions) {
    let afwijkingen = [];
    let invoerCompleet = false;

    function getNumber(componentId) {
        let value = get(componentId, 'value');

        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return null;
        }

        let number = Number(value);

        if (!isFinite(number) || number < 0) {
            return null;
        }

        return number;
    }

    function setIfChanged(componentId, value) {
        if (get(componentId, 'value') !== value) {
            set(componentId, 'value', value);
        }
    }

    function formatDutchList(items) {
        if (items.length === 0) {
            return "";
        }

        if (items.length === 1) {
            return items[0];
        }

        if (items.length === 2) {
            return items[0] + " en " + items[1];
        }

        return items.slice(0, -1).join(", ") +
            " en " + items[items.length - 1];
    }

    function add(vat, segment, stenose, systeem) {
        let score = stenoseScore(stenose);

        if (score === 0) return;

        afwijkingen.push({
            vat: vat,
            segment: segment || "",
            score: score,
            systeem: systeem || ""
        });
    }

    function verwerkVat(componentId, label, naamComponentId, systeem) {
        let normaal = get('Normaal_' + componentId, 'value');
        let vatNaam = naamComponentId
            ? get(naamComponentId, 'value')
            : label;

        // Normaal: Ja is een complete normale invoer. Eventuele oude,
        // verborgen segmentwaarden worden hierdoor volledig genegeerd.
        if (normaal === "Ja") {
            if (vatNaam) {
                invoerCompleet = true;
            }
            return;
        }

        // Segmenten en stenosen tellen alleen mee bij Normaal: Nee.
        if (normaal !== "Nee" || !vatNaam) {
            return;
        }

        let segmentKeuzes = get('Segment_' + componentId, 'value');

        ["Proximaal", "Midsegment", "Distaal"].forEach(function(segment) {
            if (!contains(segmentKeuzes, segment)) return;

            let stenose = get(
                'Stenose_' + componentId + '_' + segment,
                'value'
            );
            let plaque = get(
                'Soortplaque_' + componentId + '_' + segment,
                'value'
            );

            if (stenose && plaque) {
                invoerCompleet = true;
                add(vatNaam, segment, stenose, systeem);
            }
        });
    }

    function verwerkSysteem(vaten) {
        vaten.forEach(function(vat) {
            verwerkVat(vat[0], vat[1], vat[2], vat[3]);
        });
    }

    function calciumscoreIsActief() {
        return get('Uitvoering', 'value') ===
            "ECG getriggerde CTA met calciumscore berekening";
    }

    function updateCalciumscore() {
        let calciumActief = calciumscoreIsActief();
        let calciumscore = getNumber('CACS_Score');
        let percentiel = getNumber('CACS_Percentiel');
        let scoreHoofdstam = getNumber('CACS_Hoofdstam');
        let scoreLAD = getNumber('CACS_LAD');
        let scoreLCX = getNumber('CACS_LCX');
        let scoreRCA = getNumber('CACS_RCA');

        let alleVatScoresIngevuld =
            scoreHoofdstam !== null &&
            scoreLAD !== null &&
            scoreLCX !== null &&
            scoreRCA !== null;

        let calciumInvoerCompleet =
            calciumActief &&
            calciumscore !== null &&
            alleVatScoresIngevuld;

        let somVaten = null;
        let calciumscoreKlopt = false;
        let calciumControle = "";

        if (calciumInvoerCompleet) {
            somVaten =
                scoreHoofdstam +
                scoreLAD +
                scoreLCX +
                scoreRCA;

            // Kleine tolerantie voor eventuele decimale afronding.
            calciumscoreKlopt =
                Math.abs(somVaten - calciumscore) < 0.000001;

            if (!calciumscoreKlopt) {
                calciumControle =
                    "WAARSCHUWING: de gegevens kloppen niet. " +
                    "De som van hoofdstam, LAD, LCX en RCA is " +
                    somVaten +
                    ", terwijl de ingevoerde calciumscore " +
                    calciumscore +
                    " is. Controleer de invoer.";
            }
        }

        let calciumMismatch =
            calciumInvoerCompleet &&
            !calciumscoreKlopt;

        let invoerGeldig =
            calciumInvoerCompleet &&
            calciumscoreKlopt;

        // Waarschuwing en validatiestatus.
        setIfChanged(
            'CACS_Mismatch',
            calciumMismatch ? "Ja" : ""
        );
        setIfChanged('CACS_Controle', calciumControle);
        setIfChanged(
            'CACS_Validatie_OK',
            invoerGeldig ? "Ja" : ""
        );

        // Calciumscoretekst en lokalisatie.
        let lokalisaties = [];

        [
            [scoreHoofdstam, 'hoofdstam'],
            [scoreLAD, 'LAD'],
            [scoreLCX, 'LCX'],
            [scoreRCA, 'RCA']
        ].forEach(function(item) {
            if (
                invoerGeldig &&
                calciumscore > 0 &&
                item[0] > 0
            ) {
                lokalisaties.push(
                    item[1] + " (" + item[0] + ")"
                );
            }
        });

        let calciumscoreTekst = "";

        if (invoerGeldig) {
            calciumscoreTekst =
                "Calciumscore: " + calciumscore + ".";

            if (percentiel !== null) {
                calciumscoreTekst +=
                    " Overeenkomend met het " +
                    percentiel +
                    "e percentiel.";
            }

            if (lokalisaties.length > 0) {
                calciumscoreTekst +=
                    " Lokalisatie in " +
                    formatDutchList(lokalisaties) +
                    ".";
            }
        }

        setIfChanged('CACS_Output', calciumscoreTekst);

        // Conclusie op basis van de calciumscore.
        let calciumConclusie = "";

        if (invoerGeldig) {
            if (calciumscore === 0) {
                calciumConclusie = "Geen coronairsclerose.";
            } else if (calciumscore < 10) {
                calciumConclusie = "Minimale coronairsclerose.";
            } else if (calciumscore < 100) {
                calciumConclusie = "Milde coronairsclerose.";
            } else if (calciumscore < 300) {
                calciumConclusie = "Matig ernstige coronairsclerose.";
            } else {
                calciumConclusie = "Forse coronairsclerose.";
            }
        }

        setIfChanged('CACS_Conclusie', calciumConclusie);

        // CAC-DRS: A0 (0), A1 (1-99), A2 (100-299), A3 (>=300).
        // N is het aantal vaten met een calciumscore groter dan 0.
        let aScore = "";

        if (invoerGeldig) {
            if (calciumscore === 0) {
                aScore = "A0";
            } else if (calciumscore < 100) {
                aScore = "A1";
            } else if (calciumscore < 300) {
                aScore = "A2";
            } else {
                aScore = "A3";
            }
        }

        let aantalVaten = 0;

        if (invoerGeldig && calciumscore > 0) {
            [
                scoreHoofdstam,
                scoreLAD,
                scoreLCX,
                scoreRCA
            ].forEach(function(scorePerVat) {
                if (scorePerVat > 0) {
                    aantalVaten += 1;
                }
            });
        }

        setIfChanged(
            'CAC_DRS_Output',
            aScore === "A0"
                ? "CAC-DRS: A0"
                : aScore
                    ? "CAC-DRS: " + aScore + "/N" + aantalVaten
                    : ""
        );

        return {
            score: calciumscore,
            invoerGeldig: invoerGeldig
        };
    }

    // De calciumvalidatie draait voor CAD-RADS, zodat ook bij nog
    // onvolledige CTA-invoer de waarschuwing direct zichtbaar wordt.
    let calciumStatus = updateCalciumscore();

    let linksVaten = [
        ["Hoofdstam_Links", "Hoofdstam", null, "Hoofdstam"],
        ["LAD_Links", "LAD", null, "LAD"],
        ["D1_Links", "D1", null, "LAD"],
        ["D2_Links", "D2", null, "LAD"],
        ["LAD_Extra_Vat1_Links", "", "Naam_LAD_Extra_Vat1_Links", "LAD"],
        ["LAD_Extra_Vat2_Links", "", "Naam_LAD_Extra_Vat2_Links", "LAD"],
        ["LAD_Extra_Vat3_Links", "", "Naam_LAD_Extra_Vat3_Links", "LAD"],
        ["LAD_Extra_Vat4_Links", "", "Naam_LAD_Extra_Vat4_Links", "LAD"],
        ["LAD_Extra_Vat5_Links", "", "Naam_LAD_Extra_Vat5_Links", "LAD"],
        ["LCX_Links", "LCX", null, "LCX"],
        ["L_PLB_Links", "L PLB", null, "LCX"],
        ["L_PDA_Links", "L PDA", null, "LCX"],
        ["MO1_Links", "MO1", null, "LCX"],
        ["MO2_Links", "MO2", null, "LCX"],
        ["LCX_Extra_Vat1_Links", "", "Naam_LCX_Extra_Vat1_Links", "LCX"],
        ["LCX_Extra_Vat2_Links", "", "Naam_LCX_Extra_Vat2_Links", "LCX"],
        ["LCX_Extra_Vat3_Links", "", "Naam_LCX_Extra_Vat3_Links", "LCX"],
        ["LCX_Extra_Vat4_Links", "", "Naam_LCX_Extra_Vat4_Links", "LCX"],
        ["LCX_Extra_Vat5_Links", "", "Naam_LCX_Extra_Vat5_Links", "LCX"],
        ["RCA_Links", "RCA", null, "RCA"],
        ["RCA_Extra_Vat1_Links", "", "Naam_RCA_Extra_Vat1_Links", "RCA"],
        ["RCA_Extra_Vat2_Links", "", "Naam_RCA_Extra_Vat2_Links", "RCA"],
        ["RCA_Extra_Vat3_Links", "", "Naam_RCA_Extra_Vat3_Links", "RCA"],
        ["RCA_Extra_Vat4_Links", "", "Naam_RCA_Extra_Vat4_Links", "RCA"],
        ["RCA_Extra_Vat5_Links", "", "Naam_RCA_Extra_Vat5_Links", "RCA"]
    ];

    let rechtsVaten = [
        ["Hoofdstam_Rechts", "Hoofdstam", null, "Hoofdstam"],
        ["LAD_Rechts", "LAD", null, "LAD"],
        ["D1_Rechts", "D1", null, "LAD"],
        ["D2_Rechts", "D2", null, "LAD"],
        ["LAD_Extra_Vat1_Rechts", "", "Naam_LAD_Extra_Vat1_Rechts", "LAD"],
        ["LAD_Extra_Vat2_Rechts", "", "Naam_LAD_Extra_Vat2_Rechts", "LAD"],
        ["LAD_Extra_Vat3_Rechts", "", "Naam_LAD_Extra_Vat3_Rechts", "LAD"],
        ["LAD_Extra_Vat4_Rechts", "", "Naam_LAD_Extra_Vat4_Rechts", "LAD"],
        ["LAD_Extra_Vat5_Rechts", "", "Naam_LAD_Extra_Vat5_Rechts", "LAD"],
        ["LCX_Rechts", "LCX", null, "LCX"],
        ["MO1_Rechts", "MO1", null, "LCX"],
        ["MO2_Rechts", "MO2", null, "LCX"],
        ["LCX_Extra_Vat1_Rechts", "", "Naam_LCX_Extra_Vat1_Rechts", "LCX"],
        ["LCX_Extra_Vat2_Rechts", "", "Naam_LCX_Extra_Vat2_Rechts", "LCX"],
        ["LCX_Extra_Vat3_Rechts", "", "Naam_LCX_Extra_Vat3_Rechts", "LCX"],
        ["LCX_Extra_Vat4_Rechts", "", "Naam_LCX_Extra_Vat4_Rechts", "LCX"],
        ["LCX_Extra_Vat5_Rechts", "", "Naam_LCX_Extra_Vat5_Rechts", "LCX"],
        ["RCA_Rechts", "RCA", null, "RCA"],
        ["PDA_Rechts", "PDA", null, "RCA"],
        ["PLB_Rechts", "PLB", null, "RCA"],
        ["RCA_Extra_Vat1_Rechts", "", "Naam_RCA_Extra_Vat1_Rechts", "RCA"],
        ["RCA_Extra_Vat2_Rechts", "", "Naam_RCA_Extra_Vat2_Rechts", "RCA"],
        ["RCA_Extra_Vat3_Rechts", "", "Naam_RCA_Extra_Vat3_Rechts", "RCA"],
        ["RCA_Extra_Vat4_Rechts", "", "Naam_RCA_Extra_Vat4_Rechts", "RCA"],
        ["RCA_Extra_Vat5_Rechts", "", "Naam_RCA_Extra_Vat5_Rechts", "RCA"]
    ];

    let dominantie = get('dominantie', 'value');
    let linksDominant = dominantie === "Links dominant";
    let rechtsSysteem = dominantie === "Rechts dominant" || dominantie === "Co-dominant";

    if (linksDominant) {
        verwerkSysteem(linksVaten);
    }

    if (rechtsSysteem) {
        verwerkSysteem(rechtsVaten);
    }

    if (!linksDominant && !rechtsSysteem) {
        set('CADRADS_output', 'value', "");
        set('CADRADS_verslag', 'value', "");
        return;
    }

    // De CAD-RADS-uitvoer volgt uitsluitend de daadwerkelijk ingevulde
    // vaatbeoordeling uit de aangeleverde broncode. Er wordt geen categorie
    // toegevoegd op basis van ontbrekende, nog niet ingevulde vaten.
    if (!invoerCompleet) {
        set('CADRADS_output', 'value', "");
        set('CADRADS_verslag', 'value', "");
        return;
    }

    //-------------------------------------------------------------------------------
    // CAD-RADS analyseren
    //-------------------------------------------------------------------------------

    let hoogste = 0;
    let lmSevere = false;
    let severeVessels = new Set();

    afwijkingen.forEach(function(afwijking) {
        if (afwijking.score > hoogste) {
            hoogste = afwijking.score;
        }

        if (
            afwijking.vat === "Hoofdstam" &&
            afwijking.score >= 3
        ) {
            lmSevere = true;
        }

        if (
            ["LAD", "LCX", "RCA"].includes(afwijking.systeem) &&
            afwijking.score >= 4
        ) {
            severeVessels.add(afwijking.systeem);
        }
    });

    let cadrads = "";

    if (hoogste === 0) {
        cadrads = "CAD-RADS: 0";
    } else if (hoogste === 1) {
        cadrads = "CAD-RADS: 1";
    } else if (hoogste === 2) {
        cadrads = "CAD-RADS: 2";
    } else if (hoogste === 3) {
        cadrads = "CAD-RADS: 3";
    } else if (hoogste === 5) {
        cadrads = "CAD-RADS: 5";
    } else if (hoogste === 4) {
        cadrads = (lmSevere || severeVessels.size >= 3)
            ? "CAD-RADS: 4B"
            : "CAD-RADS: 4A";
    }

    //-------------------------------------------------------------------------------
    // Conclusietekst opbouwen
    //-------------------------------------------------------------------------------

    function formatLocatie(segment, vat) {
        if (!vat) return "";
        if (!segment) return vat;

        let segmentKlein = segment.toLowerCase();

        if (segmentKlein === "proximaal") {
            return "proximaal in de " + vat;
        }

        if (segmentKlein === "midsegment") {
            return "midsegmenteel in de " + vat;
        }

        if (segmentKlein === "distaal") {
            return "distaal in de " + vat;
        }

        return segment + " " + vat;
    }

    function formatVaten(lijst) {
        return lijst.map(function(item) {
            return formatLocatie(item.segment, item.vat);
        }).join(", ");
    }

    let v3 = [];
    let v4 = [];
    let v5 = [];

    afwijkingen.forEach(function(afwijking) {
        if (afwijking.score === 3) {
            v3.push(afwijking);
        } else if (afwijking.score === 4) {
            v4.push(afwijking);
        } else if (afwijking.score === 5) {
            v5.push(afwijking);
        }
    });

    let verslag = "";

    if (v5.length > 0) {
        verslag += "Occlusie " + formatVaten(v5) + ". ";
    }

    if (v4.length > 0) {
        verslag += "Significant obstructief coronairlijden " +
            formatVaten(v4) + ". ";
    }

    if (v3.length > 0) {
        verslag += "Mogelijk significant obstructief coronairlijden " +
            formatVaten(v3) + ". ";
    }

    if (v3.length === 0 && v4.length === 0 && v5.length === 0) {
        verslag = "Geen significant obstructief coronairlijden.";
    } else {
        verslag = verslag.trim();
    }

    //-------------------------------------------------------------------------------
    // Output
    //-------------------------------------------------------------------------------

    if (afwijkingen.length === 0) {
        let calciumscoreNul =
            calciumStatus.invoerGeldig &&
            calciumStatus.score === 0;

        set('CADRADS_output', 'value', "CAD-RADS: 0");
        set(
            'CADRADS_verslag',
            'value',
            calciumscoreNul
                ? "Geen obstructief coronairlijden."
                : "Geen significant obstructief coronairlijden."
        );
    } else {
        set('CADRADS_output', 'value', cadrads);
        set('CADRADS_verslag', 'value', verslag);
    }
};

EventHandler.OnDataProviderRetrieve = function(get, set, data) {
};

EventHandler.OnBeforeGetState = function(get, set, extensions) {
};
