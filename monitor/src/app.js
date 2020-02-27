const express = require('express');
const db = require('./db');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const config = {
    maxLatencyIncrease: 1.2,
    maxErrorRateIncrease: 1.2,
    minReports: 50,
};

const port = 3001;

app.get('/', (req, res) => res.send('Hello World!'));

app.post('/reports', async (req, res) => {
    const newReport = await db.insertDocument(db.reportCollection, req.body);
    res.send(newReport);
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
                        $divide: [
                            { $sum: { $cond: { if: { $eq: ['$status', 'error'] }, then: 1, else: 0 } } },
                            { $sum: 1 },
                        ],
                    },
                },
            },
            { $match: { $and: [{ numTotal: { $gte: config.minReports } }, { version: { $lte: Number(version) } }] } },
            { $sort: { version: -1 } },
            { $limit: 2 },
        ])
        .toArray();

    const [currentVersion, prevVersion] = versionHistory;

    prevVersion.errorPercentage = prevVersion.numErrors / prevVersion.numTotal;
    currentVersion.errorPercentage = currentVersion.numErrors / prevVersion.numTotal;

    if (currentVersion && prevVersion) {
        if (
            (prevVersion.avgLatency - currentVersion.avgLatency) / currentVersion.avgLatency >
                config.maxLatencyIncrease ||
            (prevVersion.errorPercentage - currentVersion.errorPercentage) / currentVersion.errorPercentage >
                config.maxErrorRateIncrease
        ) {
            res.status(500).send({ status: 'rollback' });
        }
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
