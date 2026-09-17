# Applicatiebeheer-MBV

Sjablonen voor gestructureerd verslagleggen (YAML) met de bijbehorende
rekenregels (JavaScript).

## Test

De rekenregels van `SR_CTA_coronairen.js` zijn afgedekt met een regressietest.
Draai deze na elke wijziging aan dat bestand:

```
node test/SR_CTA_coronairen.regressietest.js
```

Is het gedrag bewust gewijzigd, werk dan de vastgelegde uitvoer bij en
beoordeel de diff voordat je die meecommit:

```
node test/SR_CTA_coronairen.regressietest.js --update
```