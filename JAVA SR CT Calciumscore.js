//-------------------------------------------------------------------------------
// CT calciumscore: automatische verslagteksten, vervolgbeleid en CAC-DRS
//-------------------------------------------------------------------------------

EventHandler.OnStateChange = function(get, set, extensions) {
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

    let calciumscore =
        getNumber('CACS_Score');

    let percentiel =
        getNumber('CACS_Percentiel');

    let hartfrequentie =
        getNumber('Hartfrequentie');

    //-------------------------------------------------------------------------------
    // Aanvragertype bepalen via SectraIds7.ExamDescription
    //-------------------------------------------------------------------------------

    let examDescriptionWaarde =
        get('ExamDescription', 'value');

    let examDescription =
        examDescriptionWaarde === null ||
        examDescriptionWaarde === undefined
            ? ""
            : String(examDescriptionWaarde);

    let vorigeExamDescription =
        get(
            'ExamDescription_Verwerkt',
            'value'
        ) || "";

    let aanvrager =
        get('Aanvrager_Type', 'value');

    if (
        examDescription !== "" &&
        examDescription !== vorigeExamDescription
    ) {
        aanvrager =
            examDescription
                .toLowerCase()
                .indexOf("huisarts") !== -1
                    ? "Huisarts"
                    : "Specialist";

        setIfChanged(
            'ExamDescription_Verwerkt',
            examDescription
        );

        setIfChanged(
            'Aanvrager_Type',
            aanvrager
        );
    }

    //-------------------------------------------------------------------------------
    // Controle totale calciumscore versus som van de vier vaten
    //-------------------------------------------------------------------------------

    let scoreHoofdstam =
        getNumber('CACS_Hoofdstam');

    let scoreLAD =
        getNumber('CACS_LAD');

    let scoreLCX =
        getNumber('CACS_LCX');

    let scoreRCA =
        getNumber('CACS_RCA');

    let alleVatScoresIngevuld =
        scoreHoofdstam !== null &&
        scoreLAD !== null &&
        scoreLCX !== null &&
        scoreRCA !== null;

    let calciumInvoerCompleet =
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

        calciumscoreKlopt =
            Math.abs(
                somVaten - calciumscore
            ) < 0.000001;

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

    //-------------------------------------------------------------------------------
    // Validatiestatus naar YAML
    //-------------------------------------------------------------------------------

    setIfChanged(
        'CACS_Mismatch',
        calciumMismatch
            ? "Ja"
            : ""
    );

    setIfChanged(
        'CACS_Controle',
        calciumControle
    );

    setIfChanged(
        'CACS_Validatie_OK',
        invoerGeldig
            ? "Ja"
            : ""
    );

    //-------------------------------------------------------------------------------
    // Calciumscoretekst en lokalisatie
    //-------------------------------------------------------------------------------

    let lokalisaties = [];

    [
        ['CACS_Hoofdstam', 'hoofdstam'],
        ['CACS_LAD', 'LAD'],
        ['CACS_LCX', 'LCX'],
        ['CACS_RCA', 'RCA']
    ].forEach(function(item) {
        let scorePerVat =
            getNumber(item[0]);

        if (
            invoerGeldig &&
            calciumscore > 0 &&
            scorePerVat !== null &&
            scorePerVat > 0
        ) {
            lokalisaties.push(
                item[1] +
                " (" +
                scorePerVat +
                ")"
            );
        }
    });

    let calciumscoreTekst = "";

    if (invoerGeldig) {
        calciumscoreTekst =
            "Calciumscore: " +
            calciumscore +
            ".";

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

    setIfChanged(
        'CACS_Output',
        calciumscoreTekst
    );

    //-------------------------------------------------------------------------------
    // Conclusie op basis van de calciumscore
    //-------------------------------------------------------------------------------

    let calciumConclusie = "";

    if (invoerGeldig) {
        if (calciumscore === 0) {
            calciumConclusie =
                "Geen coronairsclerose.";
        } else if (calciumscore < 10) {
            calciumConclusie =
                "Minimale coronairsclerose.";
        } else if (calciumscore < 100) {
            calciumConclusie =
                "Milde coronairsclerose.";
        } else if (calciumscore <= 300) {
            calciumConclusie =
                "Matig ernstige coronairsclerose.";
        } else {
            calciumConclusie =
                "Forse coronairsclerose.";
        }
    }

    setIfChanged(
        'CACS_Conclusie',
        calciumConclusie
    );

    //-------------------------------------------------------------------------------
    // CAC-DRS
    //
    // A0 = 0
    // A1 = 1 t/m 99
    // A2 = 100 t/m 299
    // A3 = 300 of hoger
    //
    // N = aantal vaten met calcium > 0
    //-------------------------------------------------------------------------------

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

    if (
        invoerGeldig &&
        calciumscore > 0
    ) {
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
        aScore
            ? "CAC-DRS: " +
              aScore +
              "/N" +
              aantalVaten
            : ""
    );

    //-------------------------------------------------------------------------------
    // Protocoladvies aanvullend onderzoek of verwijzing
    //-------------------------------------------------------------------------------

    let protocolSleutel = "";
    let protocolNodig = "";
    let protocolHuisarts = "";
    let protocolSpecialist = "";

    if (
        invoerGeldig &&
        (
            aanvrager === "Huisarts" ||
            aanvrager === "Specialist"
        )
    ) {
        protocolSleutel =
            aanvrager +
            "|" +
            calciumscore;

        if (aanvrager === "Huisarts") {
            if (calciumscore === 0) {
                protocolNodig = "Nee";
            } else if (calciumscore <= 300) {
                protocolNodig = "Ja";
                protocolHuisarts =
                    "CTA coronairen";
            } else {
                protocolNodig = "Ja";
                protocolHuisarts =
                    "Verwijzing poli cardiologie";
            }
        } else if (
            calciumscore === 0 ||
            calciumscore > 1000
        ) {
            protocolNodig = "Nee";
        } else if (calciumscore <= 300) {
            protocolNodig = "Ja";
            protocolSpecialist =
                "CTA coronairen";
        } else {
            protocolNodig = "Ja";
            protocolSpecialist =
                "Rb-PET";
        }
    }

    let vorigeProtocolSleutel =
        get(
            'Aanvullend_Protocol_Sleutel',
            'value'
        ) || "";

    if (
        protocolSleutel !== "" &&
        protocolSleutel !== vorigeProtocolSleutel
    ) {
        setIfChanged(
            'Aanvullend_Protocol_Sleutel',
            protocolSleutel
        );

        setIfChanged(
            'Aanvullend_Nodig',
            protocolNodig
        );

        setIfChanged(
            'Aanvullend_Huisarts',
            protocolHuisarts
        );

        setIfChanged(
            'Aanvullend_Specialist',
            protocolSpecialist
        );
    } else if (protocolSleutel === "") {
        setIfChanged(
            'Aanvullend_Protocol_Sleutel',
            ""
        );

        setIfChanged(
            'Aanvullend_Nodig',
            ""
        );

        setIfChanged(
            'Aanvullend_Huisarts',
            ""
        );

        setIfChanged(
            'Aanvullend_Specialist',
            ""
        );
    }

    //-------------------------------------------------------------------------------
    // Werkelijk geselecteerde vervolgkeuze
    //-------------------------------------------------------------------------------

    let geselecteerdNodig =
        get(
            'Aanvullend_Nodig',
            'value'
        );

    let geselecteerdHuisarts =
        get(
            'Aanvullend_Huisarts',
            'value'
        );

    let geselecteerdSpecialist =
        get(
            'Aanvullend_Specialist',
            'value'
        );

    //-------------------------------------------------------------------------------
    // Actie richting patiënt / aanvullend onderzoek
    //-------------------------------------------------------------------------------

    let aanvullendTekst = "";

    if (
        invoerGeldig &&
        aanvrager === "Huisarts"
    ) {
        if (geselecteerdNodig === "Nee") {
            aanvullendTekst =
                "Volgens protocol geen verdere onderzoeken " +
                "geïndiceerd. Verdere begeleiding in de " +
                "eerste lijn.";
        } else if (
            geselecteerdNodig === "Ja" &&
            geselecteerdHuisarts ===
                "CTA coronairen"
        ) {
            aanvullendTekst =
                "Aanvullend zal een CTA coronairen " +
                "worden verricht.";
        } else if (
            geselecteerdNodig === "Ja" &&
            geselecteerdHuisarts ===
                "Verwijzing poli cardiologie"
        ) {
            aanvullendTekst =
                "Patiënt is aangemeld bij polikliniek " +
                "cardiologie. Patiënt ontvangt hiervoor " +
                "een oproep.";
        }
    } else if (
        invoerGeldig &&
        aanvrager === "Specialist"
    ) {
        if (geselecteerdNodig === "Nee") {
            aanvullendTekst =
                "Conform protocol wordt geen verdere " +
                "beeldvorming vervaardigd en gaat patiënt " +
                "retour polikliniek cardiologie voor " +
                "bespreken uitslag en beleid.";
        } else if (
            geselecteerdNodig === "Ja" &&
            geselecteerdSpecialist ===
                "CTA coronairen"
        ) {
            aanvullendTekst =
                "Aanvullend zal een CTA coronairen " +
                "worden verricht.";
        } else if (
            geselecteerdNodig === "Ja" &&
            geselecteerdSpecialist ===
                "Rb-PET"
        ) {
            aanvullendTekst =
                "Aanvullend zal een Rubidium PET " +
                "worden verricht.";
        }
    }

    setIfChanged(
        'Aanvullend_Output',
        aanvullendTekst
    );

    //-------------------------------------------------------------------------------
    // Metoprolol
    //
    // Alleen bij:
    // - geldige calciumscore
    // - CTA coronairen
    // - hartfrequentie > 55
    //-------------------------------------------------------------------------------

    let ctaGeselecteerd =
        invoerGeldig &&
        geselecteerdNodig === "Ja" &&
        (
            (
                aanvrager === "Huisarts" &&
                geselecteerdHuisarts ===
                    "CTA coronairen"
            ) ||
            (
                aanvrager === "Specialist" &&
                geselecteerdSpecialist ===
                    "CTA coronairen"
            )
        );

    setIfChanged(
        'Metoprolol_Output',
        hartfrequentie !== null &&
        hartfrequentie > 55 &&
        ctaGeselecteerd
            ? "Indien geïndiceerd zal er naar patiënt ter voorbereiding een recept metoprolol worden gestuurd."
            : ""
    );
};

EventHandler.OnDataProviderRetrieve = function(get, set, data) {
};

EventHandler.OnBeforeGetState = function(get, set, extensions) {
};