const { db } = require('../src/firebaseAdmin');

const BATCH_LIMIT = 450;
const USER_DEPENDENT_COLLECTIONS = [
  {
    name: 'cameraFrames',
    mode: 'documentId',
  },
  {
    name: 'cameraCaptureRequests',
    mode: 'documentId',
  },
  {
    name: 'emotionEvents',
    mode: 'field',
    field: 'employeeId',
  },
];

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function commitDeletes(refs) {
  let deleted = 0;

  for (const refsChunk of chunk(refs, BATCH_LIMIT)) {
    const batch = db.batch();
    refsChunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
    deleted += refsChunk.length;
  }

  return deleted;
}

async function getCollectionDocRefs(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  return snapshot.docs.map((doc) => doc.ref);
}

async function getDependentDocRefs(userIds) {
  const dependentRefs = [];

  for (const collectionConfig of USER_DEPENDENT_COLLECTIONS) {
    if (collectionConfig.mode === 'documentId') {
      userIds.forEach((userId) => {
        dependentRefs.push(db.collection(collectionConfig.name).doc(userId));
      });
      continue;
    }

    for (const userId of userIds) {
      const snapshot = await db
        .collection(collectionConfig.name)
        .where(collectionConfig.field, '==', userId)
        .get();
      snapshot.docs.forEach((doc) => dependentRefs.push(doc.ref));
    }
  }

  const uniqueRefs = new Map();
  dependentRefs.forEach((ref) => uniqueRefs.set(ref.path, ref));
  return Array.from(uniqueRefs.values());
}

async function main() {
  const shouldDelete = process.argv.includes('--yes');

  const [userRefs, companyRefs] = await Promise.all([
    getCollectionDocRefs('users'),
    getCollectionDocRefs('companies'),
  ]);
  const userIds = userRefs.map((ref) => ref.id);
  const dependentRefs = await getDependentDocRefs(userIds);

  console.log('Firestore cleanup scope:');
  console.log(`- users: ${userRefs.length}`);
  console.log(`- companies: ${companyRefs.length}`);
  console.log(`- user-dependent documents: ${dependentRefs.length}`);

  if (!shouldDelete) {
    console.log('Dry run only. Re-run with --yes to delete these records.');
    return;
  }

  const dependentDeleted = await commitDeletes(dependentRefs);
  const usersDeleted = await commitDeletes(userRefs);
  const companiesDeleted = await commitDeletes(companyRefs);

  console.log('Firestore cleanup completed:');
  console.log(`- users deleted: ${usersDeleted}`);
  console.log(`- companies deleted: ${companiesDeleted}`);
  console.log(`- user-dependent documents deleted: ${dependentDeleted}`);

  const [remainingUserRefs, remainingCompanyRefs] = await Promise.all([
    getCollectionDocRefs('users'),
    getCollectionDocRefs('companies'),
  ]);

  console.log('Post-cleanup verification:');
  console.log(`- remaining users: ${remainingUserRefs.length}`);
  console.log(`- remaining companies: ${remainingCompanyRefs.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Cleanup failed:', error);
    process.exit(1);
  });
