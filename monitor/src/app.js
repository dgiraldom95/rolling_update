const express = require('express');
const db = require('./db');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const port = 3001;

app.get('/', (req, res) => res.send('Hello World!'));

app.post('/reports', async (req, res) => {
    console.log('Received report ', req.body);
    const newReport = await db.insertDocument(db.reportCollection, req.body);
    console.log('Saved report', newReport);
    res.send(newReport);
});

app.get('/reports', async (req, res) => {
    res.send(await db.getDocuments(db.reportCollection));
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
