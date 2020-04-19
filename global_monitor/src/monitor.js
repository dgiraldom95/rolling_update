const express = require('express');
const db = require('./db');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const config = {
    maxLatencyIncrease: 1.2,
    maxErrorRateIncrease: 1.2,
    maxRamIncrease: 1.2,
    maxCPUIncrease: 1.2,
    maxNetIOIncrease: 1.2,
    minReports: 10,
    minResourcesReports: 10,
};

const port = 3011;

app.get('/', (req, res) => res.send('Hello World!'));

app.post('/reports', async (req, res) => {
    const newReport = await db.insertDocument(db.reportCollection, req.body);
    res.send(newReport);
});

app.post('/resources', async (req, res) => {
    const newResources = await db.insertDocuments(db.resourcesCollection, req.body);
    // console.log('Received resources report: ', req.body);
    res.send(newResources);
});

app.post('/version', async (req, res) => {
    const newReport = await db.insertDocument(db.versionCollection, req.body);
    res.send(newReport);
});

app.get('/version', async (req, res) => {
    const reports = await db.getCollection(db.reportCollection);

    const versions = await reports
        .aggregate([
            {
                $group: {
                    _id: { version: '$version' },
                    firstReportDate: { $min: '$date' },
                    avgLatency: { $avg: '$latency' },
                    numTotal: { $sum: 1 },
                    numErrors: { $sum: { $cond: { if: { $eq: ['$status', 'err'] }, then: 1, else: 0 } } },
                },
            },
        ])
        .toArray();
    const reponseObj = versions.map(v => ({ appVersion: v._id.version, deployDate: v.firstReportDate }));
    res.send({ reponseObj, versions });
});

app.get('/health-report/:version', async (req, res) => {
    const version = Number(req.params.version);

    const getQOSMetrics = async version => {
        const reports = await db.getCollection(db.reportCollection);
        return reports
            .aggregate([
                {
                    $group: {
                        _id: { $toInt: '$version' },
                        firstReportDate: { $min: '$date' },
                        avgLatency: { $avg: '$latency' },
                        count: { $sum: 1 },
                        numErrors: { $sum: { $cond: { if: { $eq: ['$status', 'error'] }, then: 1, else: 0 } } },
                    },
                },
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

    const getResources = async version => {
        const resources = await db.getCollection(db.resourcesCollection);
        return resources
            .aggregate([
                { $match: { image: /iot_edge/ } },
                {
                    $group: {
                        _id: { $toInt: '$version' },
                        ram: { $avg: '$ram' },
                        cpu: { $avg: '$cpu' },
                        netIO: { $avg: '$netIO' },
                        count: { $sum: 1 },
                    },
                },
                { $match: { _id: { $lte: version } } },
                { $sort: { _id: -1 } },
                { $limit: 2 },
            ])
            .toArray();
    };

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
        currResourcesCount < minResourcesReports ||
        prevResourcesCount < minResourcesReports ||
        currReportsCount < minReports ||
        prevReportsCount < minReports
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
        res.status(200).send({ ...report, status: 'rollback' });
    }

    res.status(200).send({ ...report, status: 'ok' });
});

app.get('/reports', async (req, res) => {
    res.send(await db.getDocuments(db.reportCollection));
});

app.get('/healthcheck', (req, res) => {
    res.status(200).end();
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
