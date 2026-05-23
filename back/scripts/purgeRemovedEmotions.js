const { db } = require('../src/firebaseAdmin');

const REMOVED_EMOTIONS = new Set(['sad', 'surprise', 'disgust']);

function normalizeEmotion(value) {
  return String(value || '').trim().toLowerCase();
}

async function commitBatch(operations) {
  let total = 0;

  for (let index = 0; index < operations.length; index += 450) {
    const batch = db.batch();
    const chunk = operations.slice(index, index + 450);

    chunk.forEach((operation) => operation(batch));
    await batch.commit();
    total += chunk.length;
  }

  return total;
}

async function purgeEmotionEvents() {
  const snapshot = await db.collection('emotionEvents').get();
  const deletes = snapshot.docs
    .filter((doc) => REMOVED_EMOTIONS.has(normalizeEmotion(doc.data().emotion)))
    .map((doc) => (batch) => batch.delete(doc.ref));

  return commitBatch(deletes);
}

async function clearUserLastEmotions() {
  const snapshot = await db.collection('users').get();
  const updates = snapshot.docs.reduce((operations, doc) => {
    const data = doc.data();
    const nextData = {};
    const emotionFields = ['lastEmotion', 'liveVibe', 'emotion', 'dominantEmotion', 'vibe'];

    emotionFields.forEach((field) => {
      if (REMOVED_EMOTIONS.has(normalizeEmotion(data[field]))) {
        nextData[field] = null;
      }
    });

    if (Object.keys(nextData).length) {
      nextData.lastEmotionRaw = null;
      operations.push((batch) => batch.set(doc.ref, nextData, { merge: true }));
    }

    return operations;
  }, []);

  return commitBatch(updates);
}

async function main() {
  const [deletedEvents, updatedUsers] = await Promise.all([
    purgeEmotionEvents(),
    clearUserLastEmotions(),
  ]);

  console.log(`Deleted emotionEvents: ${deletedEvents}`);
  console.log(`Updated users: ${updatedUsers}`);
}

main().catch((error) => {
  console.error('Could not purge removed emotions:', error);
  process.exitCode = 1;
});
