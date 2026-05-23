const HR_USER = {
  id: 'gon',
  username: 'gon',
  password: '1234',
  companyId: 'nintendo',
  companyName: 'Nintendo',
  role: 'hr',
};

async function seedHrUser(db) {
  await db.collection('companies').doc(HR_USER.companyId).set(
    {
      companyName: HR_USER.companyName,
      active: true,
    },
    { merge: true }
  );

  await db.collection('users').doc(HR_USER.id).set(
    {
      username: HR_USER.username,
      companyName: HR_USER.companyName,
      role: HR_USER.role,
      password: HR_USER.password,
    },
    { merge: true }
  );

  return HR_USER;
}

module.exports = {
  HR_USER,
  seedHrUser,
};
