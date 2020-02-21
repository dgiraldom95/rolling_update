MongoClient = require('mongodb').MongoClient;

// Connection URL
const url = 'mongodb://db:27017';

// Database Name
const dbName = 'monitoring';

// Create a new MongoClient
const client = new MongoClient(url);

const reportCollection = 'report'

const getDB = async () => {
    await new Promise((resolve, reject) => {
        client.connect(() => resolve());
    });
    const db = client.db(dbName);
    return db;
};

const insertDocument = async (collection, document) => {
    const db = await getDB();
    const collectionInsert = db.collection(collection);
    return new Promise((resolve, reject) => {
        collectionInsert.insertOne(document, function(err, result) {
            resolve(result);
        });
    });
};

const getDocuments = async collection => {
    console.log(collection);
    const db = await getDB();
    const collectionGet = db.collection(collection);
    return new Promise((resolve, reject) => {
        collectionGet.find({}).toArray(function(err, docs) {
            resolve(docs);
        });
    });
};

module.exports = { getDocuments, insertDocument, reportCollection };