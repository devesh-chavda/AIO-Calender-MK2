import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

export async function runRulesTests(testEnv: any) {
  const unauthedDb = testEnv.unauthenticatedContext().firestore();
  const aliceDb = testEnv.authenticatedContext('user_1').firestore();
  const bobDb = testEnv.authenticatedContext('user_2').firestore();

  const validPayload = {
    schedules: { 'Monsoon 2026': [] },
    tasks: [],
    notifSettings: {
      classNotifs: true,
      classLeadTime: '10',
      taskNotifs: true,
      taskLeadTime: '60',
      taskRepeatFrequency: 'daily',
      vibrateEnabled: true
    }
  };

  // 1. Unauthenticated write denied
  await assertFails(unauthedDb.collection('users').doc('user_1').set(validPayload));

  // 2. Unauthenticated read denied
  await assertFails(unauthedDb.collection('users').doc('user_1').get());

  // 3. Cross-user write denied
  await assertFails(bobDb.collection('users').doc('user_1').set(validPayload));

  // 4. Shadow field on create denied
  await assertFails(aliceDb.collection('users').doc('user_1').set({ ...validPayload, isAdmin: true }));

  // 5. Valid create succeeds
  await assertSucceeds(aliceDb.collection('users').doc('user_1').set(validPayload));

  // 6. Shadow field on update denied
  await assertFails(aliceDb.collection('users').doc('user_1').update({ role: 'admin' }));

  // 7. Type poisoning on schedules denied
  await assertFails(aliceDb.collection('users').doc('user_1').update({ schedules: 'bad' }));

  // 8. Type poisoning on tasks denied
  await assertFails(aliceDb.collection('users').doc('user_1').update({ tasks: 'bad' }));

  // 9. Type poisoning on notifSettings denied
  await assertFails(aliceDb.collection('users').doc('user_1').update({ notifSettings: 'bad' }));

  // 10. Cross-user read denied
  await assertFails(bobDb.collection('users').doc('user_1').get());
}
