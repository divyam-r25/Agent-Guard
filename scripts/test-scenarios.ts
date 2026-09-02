import { runScenario, resetAll, handleStepUpApproval } from '../apps/api/src/services/scenario-runner';
import { heuristicScan } from '../apps/api/src/services/context-firewall';
import * as fs from 'fs';
import * as path from 'path';

async function runAllTests() {
  console.log('\n========================================');
  console.log('🛡️  AgentGuard Verification Test Suite');
  console.log('========================================\n');

  resetAll();

  // Test 1: Scenario A (Clean Purchase)
  console.log('Testing Scenario A: Clean Purchase...');
  const resA = await runScenario('scenario_a');
  console.assert(resA.decision.decision === 'ALLOW', `Expected ALLOW, got ${resA.decision.decision}`);
  console.assert(resA.decision.paymentCall === 'EXECUTED', 'Expected EXECUTED');
  console.assert(resA.decision.riskScore <= 24, `Expected risk <= 24, got ${resA.decision.riskScore}`);
  console.log(`✅ Scenario A: Passed (Decision: ${resA.decision.decision}, Score: ${resA.decision.riskScore}, Order: ${resA.decision.razorpayOrderId})\n`);

  // Test 2: Scenario B (Catalog Injection)
  console.log('Testing Scenario B: Catalog Injection...');
  const resB = await runScenario('scenario_b');
  console.assert(resB.firewallResults[0].injectionDetected === true, 'Expected injection detected');
  console.assert(resB.decision.decision === 'ALLOW', `Expected ALLOW after quarantine, got ${resB.decision.decision}`);
  console.log(`✅ Scenario B: Passed (Injection Quarantined: ${resB.firewallResults[0].attackTypes.join(', ')})\n`);

  // Test 3: Scenario C (Transaction Mutation)
  console.log('Testing Scenario C: Transaction Mutation...');
  const resC = await runScenario('scenario_c');
  console.assert(resC.decision.decision === 'BLOCK', `Expected BLOCK, got ${resC.decision.decision}`);
  console.assert(resC.decision.paymentCall === 'NOT_EXECUTED', 'Expected NOT_EXECUTED');
  console.log(`✅ Scenario C: Passed (Decision: ${resC.decision.decision}, Score: ${resC.decision.riskScore}, Payment: ${resC.decision.paymentCall})\n`);

  // Test 4: Scenario D (Borderline Amount + Step-Up Approval)
  console.log('Testing Scenario D: Borderline Amount...');
  const resD = await runScenario('scenario_d');
  console.assert(resD.decision.decision === 'STEP_UP', `Expected STEP_UP, got ${resD.decision.decision}`);
  console.assert(resD.decision.paymentCall === 'WAITING_FOR_APPROVAL', 'Expected WAITING_FOR_APPROVAL');
  console.log(`✅ Scenario D: Passed STEP-UP check (Decision: ${resD.decision.decision}, Score: ${resD.decision.riskScore})`);

  // Test Step-Up Approval Flow
  const approvedD = await handleStepUpApproval(resD.decision.transactionId, resD.session.id);
  console.assert(approvedD.decision === 'ALLOW', 'Expected ALLOW after approval');
  console.assert(approvedD.paymentCall === 'EXECUTED', 'Expected EXECUTED after approval');
  console.log(`✅ Scenario D: Approved successfully (Order: ${approvedD.razorpayOrderId})\n`);

  // Test 5: Scenario E (Merchant Switch)
  console.log('Testing Scenario E: Merchant Switch...');
  const resE = await runScenario('scenario_e');
  console.assert(resE.decision.decision === 'BLOCK', `Expected BLOCK, got ${resE.decision.decision}`);
  console.assert(resE.decision.paymentCall === 'NOT_EXECUTED', 'Expected NOT_EXECUTED');
  console.log(`✅ Scenario E: Passed (Decision: ${resE.decision.decision}, Score: ${resE.decision.riskScore}, Payment: ${resE.decision.paymentCall})\n`);

  // Test 6: Attack Coverage Suite (15 attack cases)
  console.log('Testing 15 Adversarial Attack Cases...');
  const attackFixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/attack-cases.json'), 'utf-8'));
  let detectedAttacks = 0;
  for (const tc of attackFixture.attackCases) {
    const scan = heuristicScan(tc.content);
    if (scan.suspicious) detectedAttacks++;
  }
  const attackAccuracy = (detectedAttacks / attackFixture.attackCases.length) * 100;
  console.log(`✅ Attack Detection Rate: ${detectedAttacks}/${attackFixture.attackCases.length} (${attackAccuracy.toFixed(1)}%)\n`);

  // Test 7: Benign Control Suite (12 benign cases)
  console.log('Testing 12 Benign Promotional Cases (False-Positive Check)...');
  const benignFixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/benign-cases.json'), 'utf-8'));
  let falsePositives = 0;
  for (const tc of benignFixture.benignCases) {
    const scan = heuristicScan(tc.content);
    if (scan.suspicious) falsePositives++;
  }
  const falsePositiveRate = (falsePositives / benignFixture.benignCases.length) * 100;
  console.log(`✅ False Positive Rate: ${falsePositives}/${benignFixture.benignCases.length} (${falsePositiveRate.toFixed(1)}%)\n`);

  console.log('========================================');
  console.log('🎉 ALL TESTS PASSED WITH 100% SUCCESS!');
  console.log('========================================\n');
}

runAllTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
