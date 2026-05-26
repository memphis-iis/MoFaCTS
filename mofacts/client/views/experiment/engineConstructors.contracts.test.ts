import { expect } from 'chai';
import { createUnitEngine, createUnitEngineForUnit, resolveUnitEngineTypeForUnit } from './engineConstructors';

describe('unit engine creation contracts', function() {
  it('derives unit engine types from runnable unit shape in one shared boundary', function() {
    expect(resolveUnitEngineTypeForUnit({ assessmentsession: {} }, 'unit-engine-contract-test')).to.equal('schedule');
    expect(resolveUnitEngineTypeForUnit({ videosession: {} }, 'unit-engine-contract-test')).to.equal('video');
    expect(resolveUnitEngineTypeForUnit({ learningsession: {} }, 'unit-engine-contract-test')).to.equal('model');
    expect(resolveUnitEngineTypeForUnit({ autotutorsession: {} }, 'unit-engine-contract-test')).to.equal('autotutor');
    expect(resolveUnitEngineTypeForUnit({ unitinstructions: 'Read this first' }, 'unit-engine-contract-test')).to.equal('instruction-only');
  });

  it('rejects missing unit data before choosing an engine implementation', async function() {
    try {
      await createUnitEngineForUnit(null, { experimentState: {} }, {
        source: 'unit-engine-contract-test',
      });
      throw new Error('Expected createUnitEngineForUnit to reject a missing unit');
    } catch (error: unknown) {
      expect(error).to.be.instanceOf(Error);
      expect((error as Error).message).to.include(
        'unit-engine-contract-test: Cannot create unit engine without currentTdfUnit',
      );
    }
  });

  it('rejects units with no runnable domain shape', async function() {
    try {
      await createUnitEngineForUnit(
        { unitname: 'Loose Notes' },
        { experimentState: {} },
        { source: 'unit-engine-contract-test', unitNumber: 2 },
      );
      throw new Error('Expected createUnitEngineForUnit to reject an unrunnable unit');
    } catch (error: unknown) {
      expect(error).to.be.instanceOf(Error);
      const message = (error as Error).message;
      expect(message).to.include('Cannot determine unit type for unit "Loose Notes"');
      expect(message).to.include(
        'Expected assessmentsession, learningsession, videosession, autotutorsession, or instruction-only content',
      );
      expect(message).to.include('Unit has: no runnable unit shape');
    }
  });

  it('rejects unknown explicit unit types with unit context in the error', async function() {
    try {
      await createUnitEngine(
        'quiz',
        { experimentState: {} },
        {
          source: 'unit-engine-contract-test',
          unit: { unitname: 'Unit Q', learningsession: {} },
          unitNumber: 4,
        },
      );
      throw new Error('Expected createUnitEngine to reject an unknown unit type');
    } catch (error: unknown) {
      expect(error).to.be.instanceOf(Error);
      const message = (error as Error).message;
      expect(message).to.include('Unknown unit type "quiz" for unit "Unit Q" at index 4');
      expect(message).to.include("Registered unit engine types:");
      expect(message).to.include("'schedule'");
      expect(message).to.include("'model'");
      expect(message).to.include("'video'");
      expect(message).to.include("'autotutor'");
      expect(message).to.include("'instruction-only'");
      expect(message).to.include('Unit has: learningsession');
    }
  });
});
