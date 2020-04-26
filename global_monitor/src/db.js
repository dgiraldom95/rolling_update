const MongoClient = require('mongodb').MongoClient;

const mongoHost = 'localhost';
// Connection URL
const url = `mongodb://${mongoHost}:27018`;

// Database Name
const dbName = 'monitoring';

// Create a new MongoClient
const client = new MongoClient(url);

const qosCollection = 'qos';
const resourcesCollection = 'resources';
const versionCollection = 'version';

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
        collectionInsert.insertOne(document, function (err, result) {
            resolve(result);
        });
    });
};

const insertDocuments = async (collection, documents) => {
    const db = await getDB();
    const collectionInsert = db.collection(collection);
    return new Promise((resolve, reject) => {
        collectionInsert.insertMany(documents, (err, result) => {
            if (err) {
                console.log(err);
            }
            resolve(result);
        });
    });
};

const getDocuments = async (collection, filters = {}) => {
    const db = await getDB();
    const collectionGet = db.collection(collection);
    return new Promise((resolve, reject) => {
        collectionGet.find({}).toArray(function (err, docs) {
            resolve(docs);
        });
    });
};

const getCollection = async (collection) => {
    const db = await getDB();
    return db.collection(collection);
};

module.exports = {
    getDocuments,
    insertDocument,
    qosCollection,
    resourcesCollection,
    versionCollection,
    getCollection,
    insertDocuments,
};
