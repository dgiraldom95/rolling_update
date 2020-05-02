const express = require('express');
const db = require('./db');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
app.use(bodyParser.json());

const port = 8000;

let rawConfig = fs.readFileSync('./config.json');
const config = JSON.parse(rawConfig);

const apiKey = fs.readFileSync('./apiKey.txt').toString();

app.get('/', (req, res) => res.send('Hello World!'));

app.post('/version', async (req, res) => {
    if (!req.body.version) res.status(400).send({ error: 'Missing required field version' });

    const version = Number(req.body.version);

    if (isNaN(version)) res.status(400).send({ error: 'Version must be a number' });

    const versionC = await db.getCollection(db.versionCollection);
    const prevVersion = (await versionC.find().sort({ version: -1 }).limit(1).toArray())[0];

    if (prevVersion.version >= version)
        res.status(400).send({ error: 'Version must be greater than previous version' });

    await versionC.insertOne({ version });

    res.send(201);
});

app.get('/init', async (req, res) => {
    const versionC = await db.getCollection(db.versionCollection);
    const currentVersion = (await versionC.find().sort({ version: -1 }).limit(1).toArray())[0];
    res.send({ imageName: config.imageName, version: currentVersion.version });
});

app.get('/version', async (req, res) => {
    const versionC = await db.getCollection(db.versionCollection);
    const currentVersion = (await versionC.find().sort({ version: -1 }).limit(1).toArray())[0];

    res.send({ version: currentVersion.version });
});

app.get('/health-report/:version', async (req, res) => {
    const reqApiKey = req.headers.apikey;
    if (apiKey !== reqApiKey) {
        console.log('INVALID API KEY ERROR');
        res.status(401).send('Invalid apiKey');
        return;
    }

    const getQOSMetrics = async (version) => {
        const reports = await db.getCollection(db.qosCollection);
        return reports
            .aggregate([
                {
                    $group: {
                        _id: { $toInt: '$version' },
                        avgLatency: {
                            $sum: { $divide: [{ $multiply: ['$count', '$avgLatency'] }, { $sum: '$count' }] },
                        },
                        count: { $sum: '$count' },
                        numErrors: { $sum: '$numErrors' },
                    },
                },
                { $addFields: { version: { $min: '$_id' } } },
                {
                    $addFields: {
                        errorPercentage: {
                            $divide: ['$numErrors', '$count'],
                        },
                    },
                },
                { $match: { _id: { $lte: version } } },
                { $sort: { version: -1 } },
                { $limit: 2 },
            ])
            .toArray();
    };

    const getResources = async (version) => {
        const resources = await db.getCollection(db.resourcesCollection);
        return resources
            .aggregate([
                {
                    $group: {
                        _id: { $toInt: '$version' },
                        ram: { $sum: { $divide: [{ $multiply: ['$count', '$ram'] }, { $sum: '$count' }] } },
                        cpu: { $sum: { $divide: [{ $multiply: ['$count', '$cpu'] }, { $sum: '$count' }] } },
                        netIO: { $sum: { $divide: [{ $multiply: ['$count', '$netIO'] }, { $sum: '$count' }] } },
                        count: { $sum: '$count' },
                    },
                },
                { $addFields: { version: { $min: '$_id' } } },
                { $match: { _id: { $lte: version } } },
                { $sort: { _id: -1 } },
                { $limit: 2 },
            ])
            .toArray();
    };

    const version = Number(req.params.version);

    const [qos, resources] = await Promise.all([getQOSMetrics(version), getResources(version)]);

    const [cvq, pvq] = qos;
    const [cvr, pvr] = resources;

    console.log(' QOS: ', qos);
    console.log(' RESOURCES: ', resources);

    if (!(cvq && pvq && cvr && pvr)) {
        res.status(200).send({ status: 'notEnoughData' });
    }

    const latencyIncrease = (cvq.avgLatency - pvq.avgLatency) / pvq.avgLatency;
    const errorPercentageIncrease = (cvq.errorPercentage - pvq.errorPercentage) / pvq.errorPercentage;
    const ramIncrease = (cvr.ram - pvr.ram) / pvr.ram;
    const cpuIncrease = (cvr.cpu - pvr.cpu) / pvr.cpu;
    const netIOIncrease = (cvr.netIO - pvr.netIO) / pvr.netIO;

    const currResourcesCount = cvr.count;
    const prevResourcesCount = pvr.count;
    const currReportsCount = cvq.count;
    const prevReportsCount = pvq.count;

    const report = { latencyIncrease, errorPercentageIncrease, ramIncrease, cpuIncrease, netIOIncrease };

    if (
        currResourcesCount < config.minResourcesReports ||
        prevResourcesCount < config.minResourcesReports ||
        currReportsCount < config.minReports ||
        prevReportsCount < config.minReports
    ) {
        res.status(200).send({ ...report, status: 'notEnoughData' });
    }

    if (
        latencyIncrease > config.maxLatencyIncrease ||
        errorPercentageIncrease > config.maxErrorRateIncrease ||
        ramIncrease > config.maxRamIncrease ||
        cpuIncrease > config.maxCPUIncrease ||
        netIOIncrease > config.maxNetIOIncrease
    ) {
        const versionCollection = await db.getCollection(db.versionCollection);
        versionCollection.remove({ version }, true);
        res.status(200).send({ ...report, status: 'rollback' });
    }

    res.status(200).send({ ...report, status: 'ok' });
});

app.post('/reports', async (req, res) => {
    const reqApiKey = req.headers.apikey;
    if (apiKey !== reqApiKey) {
        console.log('INVALID API KEY ERROR');
        res.status(401).send('Invalid apiKey');
        return;
    }

    console.log(req.body);
    const { qos, resources } = req.body;

    if (qos && qos.length) await db.insertDocuments(db.qosCollection, qos);
    if (resources && resources.length) await db.insertDocuments(db.resourcesCollection, resources);

    res.status(200).end();
});

app.get('/healthcheck', (req, res) => {
    res.status(200).end();
});

app.post('/temperature', async (req, res) => {
    console.log(req.body);
    const { count, avg } = req.body;
    await db.insertDocument(db.temperatureCollection, {
        temperature: avg,
        count,
        date: new Date(),
    });
    res.sendStatus(200);
});

const saveFirstVersion = async () => {
    const versionC = await db.getCollection(db.versionCollection);
    const prevVersion = (await versionC.find().sort({ version: 1 }).limit(1).toArray())[0];
    if (!prevVersion) await db.insertDocument(db.versionCollection, { version: config.firstVersion });
};

saveFirstVersion();

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
