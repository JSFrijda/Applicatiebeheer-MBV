// Regressietest voor SR_CTA_coronairen.js
//
// Uitvoeren:  node test/SR_CTA_coronairen.regressietest.js
// Bijwerken:  node test/SR_CTA_coronairen.regressietest.js --update
//
// De test roept EventHandler.OnStateChange aan met nagebootste formulierinvoer
// en controleert twee dingen:
//   1. de klinische regels hieronder (expliciet uitgeschreven verwachtingen);
//   2. alle afgeleide uitvoervelden van een brede reeks scenario's, vergeleken
//      met de vastgelegde momentopname in SR_CTA_coronairen.snapshot.txt.
//
// Wijzigt het gedrag bewust? Draai met --update en beoordeel de diff van de
// momentopname voordat je die meecommit.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BRON = path.join(__dirname, '..', 'SR_CTA_coronairen.js');
const MOMENTOPNAME = path.join(__dirname, 'SR_CTA_coronairen.snapshot.txt');

const UITVOERVELDEN = [
    'CADRADS_output',
    'CADRADS_verslag',
    'CACS_Output',
    'CACS_Conclusie',
    'CAC_DRS_Output',
    'CACS_Mismatch',
    'CACS_Controle',
    'CACS_Validatie_OK'
];

const bronCode = fs.readFileSync(BRON, 'utf8');

// Draait de statehandler met de meegegeven veldwaarden en geeft alle
// uitvoervelden terug.
function draai(invoer) {
    const sandbox = { EventHandler: {} };
    vm.runInNewContext(bronCode, sandbox);

    const waarden = Object.assign({}, invoer);
    const get = (id) => (id in waarden ? waarden[id] : "");
    const set = (id, eigenschap, waarde) => { waarden[id] = waarde; };

    sandbox.EventHandler.OnStateChange(get, set, {});

    const uitvoer = {};
    UITVOERVELDEN.forEach(function(veld) {
        uitvoer[veld] = waarden[veld] === undefined ? "" : waarden[veld];
    });
    return uitvoer;
}

const CTA = 'ECG getriggerde CTA coronairen';
const CACS_UITVOERING = 'ECG getriggerde CTA met calciumscore berekening';

// Vult één vat met een afwijking in één segment.
function vat(vatId, segment, stenose, plaque) {
    const velden = {};
    velden['Normaal_' + vatId] = 'Nee';
    velden['Segment_' + vatId] = [segment];
    velden['Stenose_' + vatId + '_' + segment] = stenose;
    velden['Soortplaque_' + vatId + '_' + segment] = plaque;
    return velden;
}

function invoer() {
    return Object.assign.apply(null, [{ Uitvoering: CTA, dominantie: 'Links dominant' }]
        .concat(Array.prototype.slice.call(arguments)));
}

//-------------------------------------------------------------------------------
// 1. Klinische regels
//-------------------------------------------------------------------------------

const regels = [
    // CAD-RADS-categorie volgt de zwaarste stenose.
    ['geen afwijkingen',
        invoer({ Normaal_Hoofdstam_Links: 'Ja', Normaal_LAD_Links: 'Ja' }),
        { CADRADS_output: 'CAD-RADS: 0' }],
    ['LAD <25%',
        invoer(vat('LAD_Links', 'Proximaal', '<25%', 'Calcified')),
        { CADRADS_output: 'CAD-RADS: 1' }],
    ['LAD 25-49%',
        invoer(vat('LAD_Links', 'Proximaal', '25-49%', 'Calcified')),
        { CADRADS_output: 'CAD-RADS: 2' }],
    ['LAD 50-69%',
        invoer(vat('LAD_Links', 'Proximaal', '50-69%', 'Calcified')),
        { CADRADS_output: 'CAD-RADS: 3' }],
    ['LAD 70-99% in één vat',
        invoer(vat('LAD_Links', 'Proximaal', '70-99%', 'Calcified')),
        { CADRADS_output: 'CAD-RADS: 4A' }],
    ['LAD en LCX 70-99% (twee vaten)',
        invoer(vat('LAD_Links', 'Proximaal', '70-99%', 'Calcified'),
               vat('LCX_Links', 'Proximaal', '70-99%', 'Calcified')),
        { CADRADS_output: 'CAD-RADS: 4A' }],
    ['LAD, LCX en RCA 70-99% (drie vaten)',
        invoer(vat('LAD_Links', 'Proximaal', '70-99%', 'Calcified'),
               vat('LCX_Links', 'Proximaal', '70-99%', 'Calcified'),
               vat('RCA_Links', 'Proximaal', '70-99%', 'Calcified')),
        { CADRADS_output: 'CAD-RADS: 4B' }],
    ['occlusie',
        invoer(vat('RCA_Links', 'Distaal', 'Occlusie', 'Mixed plaque')),
        { CADRADS_output: 'CAD-RADS: 5' }],

    // Hoofdstam vanaf 50% telt als 4B, ook zonder afwijking elders.
    ['hoofdstam 50-69% geïsoleerd',
        invoer(vat('Hoofdstam_Links', 'Proximaal', '50-69%', 'Calcified')),
        { CADRADS_output: 'CAD-RADS: 4B' }],
    ['hoofdstam 70-99% geïsoleerd',
        invoer(vat('Hoofdstam_Links', 'Proximaal', '70-99%', 'Calcified')),
        { CADRADS_output: 'CAD-RADS: 4B' }],
    ['hoofdstam 25-49% blijft categorie 2',
        invoer(vat('Hoofdstam_Links', 'Proximaal', '25-49%', 'Calcified')),
        { CADRADS_output: 'CAD-RADS: 2' }],
    ['hoofdstamocclusie blijft categorie 5',
        invoer(vat('Hoofdstam_Links', 'Proximaal', 'Occlusie', 'Calcified')),
        { CADRADS_output: 'CAD-RADS: 5' }],

    // Invoer uit oudere versies blijft werken.
    ['oude waarde >70% telt als 70-99%',
        invoer(vat('LAD_Links', 'Proximaal', '>70%', 'Calcified')),
        { CADRADS_output: 'CAD-RADS: 4A' }],

    // Rechts dominant en co-dominant gebruiken dezelfde rechter vaatvelden.
    ['rechts dominant, hoofdstam 50-69%',
        Object.assign({ Uitvoering: CTA, dominantie: 'Rechts dominant' },
            vat('Hoofdstam_Rechts', 'Proximaal', '50-69%', 'Calcified')),
        { CADRADS_output: 'CAD-RADS: 4B' }],
    ['co-dominant, PDA 70-99%',
        Object.assign({ Uitvoering: CTA, dominantie: 'Co-dominant' },
            vat('PDA_Rechts', 'Proximaal', '70-99%', 'Calcified')),
        { CADRADS_output: 'CAD-RADS: 4A' }],

    // Onvolledige invoer levert geen uitspraak op.
    ['geen dominantie gekozen',
        Object.assign({ Uitvoering: CTA }, vat('LAD_Links', 'Proximaal', '70-99%', 'Calcified')),
        { CADRADS_output: '', CADRADS_verslag: '' }],
    ['segment zonder stenose en plaque',
        invoer({ Normaal_LAD_Links: 'Nee', Segment_LAD_Links: ['Proximaal'] }),
        { CADRADS_output: '', CADRADS_verslag: '' }],
    ['extra vat zonder naam telt niet mee',
        invoer(vat('LAD_Extra_Vat1_Links', 'Proximaal', '70-99%', 'Soft plaque')),
        { CADRADS_output: '', CADRADS_verslag: '' }],
    ['extra vat met naam telt wel mee',
        invoer({ Naam_LAD_Extra_Vat1_Links: 'intermedius' },
               vat('LAD_Extra_Vat1_Links', 'Proximaal', '70-99%', 'Soft plaque')),
        { CADRADS_output: 'CAD-RADS: 4A',
          CADRADS_verslag: 'Significant obstructief coronairlijden proximaal in de intermedius.' }],

    // Calciumscore: drempels, CAC-DRS en de controle op de vatsom.
    ['calciumscore 0',
        { Uitvoering: CACS_UITVOERING, dominantie: 'Links dominant', Normaal_Hoofdstam_Links: 'Ja',
          CACS_Score: 0, CACS_Hoofdstam: 0, CACS_LAD: 0, CACS_LCX: 0, CACS_RCA: 0 },
        { CACS_Conclusie: 'Geen coronairsclerose.', CAC_DRS_Output: 'CAC-DRS: A0',
          CADRADS_verslag: 'Geen obstructief coronairlijden.', CACS_Validatie_OK: 'Ja' }],
    ['calciumscore 5 (minimaal)',
        { Uitvoering: CACS_UITVOERING, dominantie: 'Links dominant', Normaal_Hoofdstam_Links: 'Ja',
          CACS_Score: 5, CACS_Hoofdstam: 0, CACS_LAD: 5, CACS_LCX: 0, CACS_RCA: 0 },
        { CACS_Conclusie: 'Minimale coronairsclerose.', CAC_DRS_Output: 'CAC-DRS: A1/N1',
          CACS_Output: 'Calciumscore: 5. Lokalisatie in LAD (5).' }],
    ['calciumscore 99 (mild)',
        { Uitvoering: CACS_UITVOERING, dominantie: 'Links dominant', Normaal_Hoofdstam_Links: 'Ja',
          CACS_Score: 99, CACS_Hoofdstam: 9, CACS_LAD: 50, CACS_LCX: 20, CACS_RCA: 20 },
        { CACS_Conclusie: 'Milde coronairsclerose.', CAC_DRS_Output: 'CAC-DRS: A1/N4' }],
    ['calciumscore 100 (matig ernstig)',
        { Uitvoering: CACS_UITVOERING, dominantie: 'Links dominant', Normaal_Hoofdstam_Links: 'Ja',
          CACS_Score: 100, CACS_Hoofdstam: 10, CACS_LAD: 50, CACS_LCX: 20, CACS_RCA: 20 },
        { CACS_Conclusie: 'Matig ernstige coronairsclerose.', CAC_DRS_Output: 'CAC-DRS: A2/N4' }],
    ['calciumscore 300 (fors)',
        { Uitvoering: CACS_UITVOERING, dominantie: 'Links dominant', Normaal_Hoofdstam_Links: 'Ja',
          CACS_Score: 300, CACS_Hoofdstam: 100, CACS_LAD: 100, CACS_LCX: 50, CACS_RCA: 50 },
        { CACS_Conclusie: 'Forse coronairsclerose.', CAC_DRS_Output: 'CAC-DRS: A3/N4' }],
    ['calciumscore met percentiel',
        { Uitvoering: CACS_UITVOERING, dominantie: 'Links dominant', Normaal_Hoofdstam_Links: 'Ja',
          CACS_Score: 50, CACS_Percentiel: 75, CACS_Hoofdstam: 0, CACS_LAD: 50, CACS_LCX: 0, CACS_RCA: 0 },
        { CACS_Output: 'Calciumscore: 50. Overeenkomend met het 75e percentiel. Lokalisatie in LAD (50).' }],
    ['vatsom klopt niet',
        { Uitvoering: CACS_UITVOERING, dominantie: 'Links dominant', Normaal_Hoofdstam_Links: 'Ja',
          CACS_Score: 100, CACS_Hoofdstam: 1, CACS_LAD: 1, CACS_LCX: 1, CACS_RCA: 1 },
        { CACS_Mismatch: 'Ja', CACS_Validatie_OK: '', CACS_Output: '', CACS_Conclusie: '' }],
    ['onvolledige calciuminvoer',
        { Uitvoering: CACS_UITVOERING, dominantie: 'Links dominant', Normaal_Hoofdstam_Links: 'Ja',
          CACS_Score: 100, CACS_Hoofdstam: 50, CACS_LAD: 50 },
        { CACS_Mismatch: '', CACS_Validatie_OK: '', CACS_Output: '' }],
    ['calciumvelden zonder calciumuitvoering',
        { Uitvoering: CTA, dominantie: 'Links dominant', Normaal_Hoofdstam_Links: 'Ja',
          CACS_Score: 100, CACS_Hoofdstam: 25, CACS_LAD: 25, CACS_LCX: 25, CACS_RCA: 25 },
        { CACS_Output: '', CACS_Conclusie: '', CAC_DRS_Output: '', CACS_Validatie_OK: '' }]
];

//-------------------------------------------------------------------------------
// 2. Scenario's voor de momentopname
//-------------------------------------------------------------------------------

function bouwScenarios() {
    const graden = ['<25%', '25-49%', '50-69%', '70-99%', 'Occlusie', '>70%'];
    const segmenten = ['Proximaal', 'Midsegment', 'Distaal'];
    const plaques = ['Calcified', 'Mixed plaque', 'Soft plaque'];
    const scenarios = [];

    scenarios.push(['leeg formulier', {}]);
    scenarios.push(['alleen uitvoering', { Uitvoering: CTA }]);
    scenarios.push(['dominantie zonder vaatinvoer', { Uitvoering: CTA, dominantie: 'Links dominant' }]);

    ['Links dominant', 'Rechts dominant', 'Co-dominant'].forEach(function(dominantie) {
        const zijde = dominantie === 'Links dominant' ? 'Links' : 'Rechts';
        const basis = { Uitvoering: CTA, dominantie: dominantie };

        ['Hoofdstam', 'LAD', 'LCX', 'RCA'].forEach(function(vatNaam) {
            graden.forEach(function(graad) {
                segmenten.forEach(function(segment) {
                    plaques.forEach(function(plaque) {
                        scenarios.push([
                            [dominantie, vatNaam, graad, segment, plaque].join('|'),
                            Object.assign({}, basis, vat(vatNaam + '_' + zijde, segment, graad, plaque))
                        ]);
                    });
                });
            });
        });

        scenarios.push([dominantie + '|drie vaten 70-99%',
            Object.assign({}, basis,
                vat('LAD_' + zijde, 'Proximaal', '70-99%', 'Calcified'),
                vat('LCX_' + zijde, 'Proximaal', '70-99%', 'Calcified'),
                vat('RCA_' + zijde, 'Proximaal', '70-99%', 'Calcified'))]);
        scenarios.push([dominantie + '|twee vaten 70-99%',
            Object.assign({}, basis,
                vat('LAD_' + zijde, 'Proximaal', '70-99%', 'Calcified'),
                vat('LCX_' + zijde, 'Proximaal', '70-99%', 'Calcified'))]);
        scenarios.push([dominantie + '|zijtakken D1, D2 en MO1 70-99%',
            Object.assign({}, basis,
                vat('D1_' + zijde, 'Proximaal', '70-99%', 'Calcified'),
                vat('D2_' + zijde, 'Midsegment', '70-99%', 'Calcified'),
                vat('MO1_' + zijde, 'Distaal', '70-99%', 'Calcified'))]);
        scenarios.push([dominantie + '|alle hoofdvaten normaal',
            Object.assign({}, basis, {
                ['Normaal_Hoofdstam_' + zijde]: 'Ja',
                ['Normaal_LAD_' + zijde]: 'Ja',
                ['Normaal_LCX_' + zijde]: 'Ja',
                ['Normaal_RCA_' + zijde]: 'Ja'
            })]);
        scenarios.push([dominantie + '|extra vat met naam',
            Object.assign({}, basis, { ['Naam_LAD_Extra_Vat1_' + zijde]: 'intermedius' },
                vat('LAD_Extra_Vat1_' + zijde, 'Proximaal', '70-99%', 'Soft plaque'))]);
        scenarios.push([dominantie + '|extra vat zonder naam',
            Object.assign({}, basis, vat('LAD_Extra_Vat1_' + zijde, 'Proximaal', '70-99%', 'Soft plaque'))]);
        scenarios.push([dominantie + '|extra vat normaal zonder naam',
            Object.assign({}, basis, { ['Normaal_LAD_Extra_Vat1_' + zijde]: 'Ja' })]);
        scenarios.push([dominantie + '|segment zonder stenose',
            Object.assign({}, basis, {
                ['Normaal_LAD_' + zijde]: 'Nee',
                ['Segment_LAD_' + zijde]: ['Proximaal']
            })]);
        scenarios.push([dominantie + '|stenose zonder plaque',
            Object.assign({}, basis, {
                ['Normaal_LAD_' + zijde]: 'Nee',
                ['Segment_LAD_' + zijde]: ['Proximaal'],
                ['Stenose_LAD_' + zijde + '_Proximaal']: '70-99%'
            })]);
        scenarios.push([dominantie + '|LAD met drie segmenten',
            Object.assign({}, basis, {
                ['Normaal_LAD_' + zijde]: 'Nee',
                ['Segment_LAD_' + zijde]: ['Proximaal', 'Midsegment', 'Distaal'],
                ['Stenose_LAD_' + zijde + '_Proximaal']: '<25%',
                ['Soortplaque_LAD_' + zijde + '_Proximaal']: 'Calcified',
                ['Stenose_LAD_' + zijde + '_Midsegment']: '50-69%',
                ['Soortplaque_LAD_' + zijde + '_Midsegment']: 'Mixed plaque',
                ['Stenose_LAD_' + zijde + '_Distaal']: 'Occlusie',
                ['Soortplaque_LAD_' + zijde + '_Distaal']: 'Soft plaque'
            })]);
    });

    const calciumBasis = {
        Uitvoering: CACS_UITVOERING,
        dominantie: 'Links dominant',
        Normaal_Hoofdstam_Links: 'Ja'
    };
    const calciumSets = [
        ['totaal 0', { CACS_Score: 0, CACS_Hoofdstam: 0, CACS_LAD: 0, CACS_LCX: 0, CACS_RCA: 0 }],
        ['som klopt 5', { CACS_Score: 5, CACS_Hoofdstam: 0, CACS_LAD: 5, CACS_LCX: 0, CACS_RCA: 0 }],
        ['som klopt 99', { CACS_Score: 99, CACS_Hoofdstam: 9, CACS_LAD: 50, CACS_LCX: 20, CACS_RCA: 20 }],
        ['som klopt 100', { CACS_Score: 100, CACS_Hoofdstam: 10, CACS_LAD: 50, CACS_LCX: 20, CACS_RCA: 20 }],
        ['som klopt 299', { CACS_Score: 299, CACS_Hoofdstam: 99, CACS_LAD: 100, CACS_LCX: 50, CACS_RCA: 50 }],
        ['som klopt 300', { CACS_Score: 300, CACS_Hoofdstam: 100, CACS_LAD: 100, CACS_LCX: 50, CACS_RCA: 50 }],
        ['som klopt niet', { CACS_Score: 100, CACS_Hoofdstam: 1, CACS_LAD: 1, CACS_LCX: 1, CACS_RCA: 1 }],
        ['vatscore ontbreekt', { CACS_Score: 100, CACS_Hoofdstam: 50, CACS_LAD: 50, CACS_LCX: 0 }],
        ['totaalscore ontbreekt', { CACS_Hoofdstam: 0, CACS_LAD: 0, CACS_LCX: 0, CACS_RCA: 0 }],
        ['met percentiel', { CACS_Score: 50, CACS_Percentiel: 75, CACS_Hoofdstam: 0, CACS_LAD: 50, CACS_LCX: 0, CACS_RCA: 0 }],
        ['negatieve waarde', { CACS_Score: -5, CACS_Hoofdstam: 0, CACS_LAD: 0, CACS_LCX: 0, CACS_RCA: 0 }],
        ['tekst als waarde', { CACS_Score: 'abc', CACS_Hoofdstam: 0, CACS_LAD: 0, CACS_LCX: 0, CACS_RCA: 0 }],
        ['decimalen', { CACS_Score: 10.5, CACS_Hoofdstam: 0.5, CACS_LAD: 10, CACS_LCX: 0, CACS_RCA: 0 }],
        ['kalk in alle vier de vaten', { CACS_Score: 400, CACS_Hoofdstam: 100, CACS_LAD: 100, CACS_LCX: 100, CACS_RCA: 100 }]
    ];

    calciumSets.forEach(function(set) {
        const naam = set[0];
        const velden = set[1];
        scenarios.push(['calcium|' + naam, Object.assign({}, calciumBasis, velden)]);
        scenarios.push(['calcium|' + naam + '|zonder calciumuitvoering',
            Object.assign({}, calciumBasis, velden, { Uitvoering: CTA })]);
        scenarios.push(['calcium|' + naam + '|met stenose',
            Object.assign({}, calciumBasis, velden, vat('LAD_Links', 'Proximaal', '70-99%', 'Calcified'))]);
    });

    return scenarios;
}

function maakMomentopname() {
    return bouwScenarios().map(function(scenario) {
        const uitvoer = draai(scenario[1]);
        const velden = UITVOERVELDEN.map(function(veld) {
            return veld + '=' + JSON.stringify(uitvoer[veld]);
        }).join(' | ');
        return scenario[0] + '  ==>  ' + velden;
    }).join('\n') + '\n';
}

//-------------------------------------------------------------------------------
// Uitvoeren
//-------------------------------------------------------------------------------

const momentopname = maakMomentopname();

if (process.argv.includes('--update')) {
    fs.writeFileSync(MOMENTOPNAME, momentopname);
    console.log('Momentopname bijgewerkt: ' + path.relative(process.cwd(), MOMENTOPNAME));
    process.exit(0);
}

let fouten = 0;

regels.forEach(function(regel) {
    const naam = regel[0];
    const verwacht = regel[2];
    const werkelijk = draai(regel[1]);

    Object.keys(verwacht).forEach(function(veld) {
        if (werkelijk[veld] !== verwacht[veld]) {
            fouten += 1;
            console.log('FOUT  ' + naam + ' -> ' + veld);
            console.log('      verwacht:  ' + JSON.stringify(verwacht[veld]));
            console.log('      gekregen:  ' + JSON.stringify(werkelijk[veld]));
        }
    });
});

console.log('Klinische regels: ' + regels.length + ' scenario\'s gecontroleerd.');

if (!fs.existsSync(MOMENTOPNAME)) {
    console.log('FOUT  momentopname ontbreekt; draai met --update.');
    fouten += 1;
} else {
    const opgeslagen = fs.readFileSync(MOMENTOPNAME, 'utf8');
    const nieuweRegels = momentopname.split('\n');
    const oudeRegels = opgeslagen.split('\n');
    let verschillen = 0;

    for (let i = 0; i < Math.max(nieuweRegels.length, oudeRegels.length); i += 1) {
        if (nieuweRegels[i] !== oudeRegels[i]) {
            verschillen += 1;
            if (verschillen <= 10) {
                console.log('AFWIJKING regel ' + (i + 1));
                console.log('      opgeslagen:  ' + (oudeRegels[i] === undefined ? '(ontbreekt)' : oudeRegels[i]));
                console.log('      nu:          ' + (nieuweRegels[i] === undefined ? '(ontbreekt)' : nieuweRegels[i]));
            }
        }
    }

    if (verschillen > 10) {
        console.log('... en nog ' + (verschillen - 10) + ' afwijkende regels.');
    }

    console.log('Momentopname: ' + (nieuweRegels.length - 1) + ' scenario\'s vergeleken.');
    fouten += verschillen;
}

if (fouten > 0) {
    console.log('\nMISLUKT: ' + fouten + ' afwijking(en).');
    process.exit(1);
}

console.log('\nGESLAAGD: gedrag ongewijzigd.');
