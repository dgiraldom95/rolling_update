const express = require('express');
const db = require('./db');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const config = {
    maxLatencyIncrease: 1.2,
    maxErrorRateIncrease: 1.2,
    minReports: 10,
};

const port = 3001;

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
    const version = req.params.version;

    const reports = await db.getCollection(db.reportCollection);
    const versionHistory = await reports
        .aggregate([
            {
                $group: {
                    _id: { version: '$version' },
                    version: { $min: '$version' },
                    firstReportDate: { $min: '$date' },
                    avgLatency: { $avg: '$latency' },
                    numTotal: { $sum: 1 },
                    numErrors: { $sum: { $cond: { if: { $eq: ['$status', 'error'] }, then: 1, else: 0 } } },
                },
            },
            {
                $addFields: {
                    errorPercentage: {
                        $divide: ['$numErrors', '$numTotal'],
                    },
                },
            },
            { $match: { $and: [{ numTotal: { $gte: config.minReports } }, { version: { $lte: Number(version) } }] } },
            { $sort: { version: -1 } },
            { $limit: 2 },
        ])
        .toArray();

    const [currentVersion, prevVersion] = versionHistory;

    if (currentVersion && prevVersion) {
        latencyIncrease = (currentVersion.avgLatency - prevVersion.avgLatency) / prevVersion.avgLatency;

        errorPercentageIncrease =
            (currentVersion.errorPercentage - prevVersion.errorPercentage) / prevVersion.errorPercentage;

        const report = { latencyIncrease, errorPercentageIncrease };

        if (latencyIncrease > config.maxLatencyIncrease || errorPercentageIncrease > config.maxErrorRateIncrease) {
            res.status(200).send({ ...report, status: 'rollback' });
        } else {
            res.status(200).send({ ...report, status: 'ok' });
        }
    } else {
        res.status(200).send({ status: 'not enough data' });
    }

    res.send(versionHistory);
});

app.get('/reports', async (req, res) => {
    res.send(await db.getDocuments(db.reportCollection));
});

app.get('/healthcheck', (req, res) => {
    res.status(200).end();
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
