const express = require('express');
const db = require('./db');
const bodyParser = require('body-parser');
const axios = require('axios');
const process = require('process');

const app = express();
app.use(bodyParser.json());

const apiKey = process.env.apiKey;


const port = 3011;

app.get('/', (req, res) => res.send('Hello World!'));

app.post('/reports', async (req, res) => {
    const newReport = await db.insertDocument(db.reportCollection, req.body);
    res.send(newReport);
});

app.post('/resources', async (req, res) => {
    const newResources = await db.insertDocuments(db.resourcesCollection, req.body);
    res.send(newResources);
});

const aggregateQOS = async () => {
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
                $addFields: { version: { $min: '$_id' } },
            },
        ])
        .toArray();
};

const aggregateResources = async () => {
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
            {
                $addFields: { version: { $min: '$_id' } },
            },
        ])
        .toArray();
};

app.get('/healthcheck', (req, res) => {
    res.status(200).end();
});

const globalReport = async () => {
    try {
        const globalMonitorHost = process.env.GLOBAL_MONITOR_HOST;

        let [qos, resources] = await Promise.all([aggregateQOS(), aggregateResources()]);
        qos = qos.map((qos) => {
            delete qos._id;
            return qos;
        });
        resources = resources.map((resources) => {
            delete resources._id;
            return resources;
        });

        const globalMonitorResponse = await axios.post(
            `http://${globalMonitorHost}:8000/reports`,
            { qos, resources },
            { headers: { apiKey } },
        );

        const qosCollection = await db.getCollection(db.reportCollection);
        await qosCollection.remove();
        const reportCollection = await db.getCollection(db.resourcesCollection);
        await reportCollection.remove();
    } catch (e) {
        console.log('Global report error: ', e);
    }
};

setInterval(globalReport, 5000);

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
