const { db } = require('../src/firebaseAdmin');
const { seedHrUser } = require('../src/hrUser');

seedHrUser(db)
  .then((user) => {
    console.log(`Seeded HR user "${user.username}" for ${user.companyName}.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Could not seed HR user:', error.message);
    process.exit(1);
  });
