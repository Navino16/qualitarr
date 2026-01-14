import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateScoreComparison,
  handleScoreResult,
  logScoreComparison,
  logDryRunResult,
} from '../../src/services/score.js';
import type {
  ScoreComparisonInput,
  ScoreComparisonResult,
  ScoreResultContext,
  ScoreResultServices,
} from '../../src/types/score.js';
import type { TagConfig, QualityConfig } from '../../src/types/config.js';

describe('calculateScoreComparison', () => {
  const defaultConfig = {
    maxOverScore: 100,
    maxUnderScore: 0,
  };

  describe('when actual equals expected', () => {
    it('should return difference of 0 and be acceptable', () => {
      const input: ScoreComparisonInput = {
        expectedScore: 50,
        actualScore: 50,
        ...defaultConfig,
      };

      const result = calculateScoreComparison(input);

      expect(result.difference).toBe(0);
      expect(result.isAcceptable).toBe(true);
      expect(result.expectedScore).toBe(50);
      expect(result.actualScore).toBe(50);
    });
  });

  describe('when actual is higher than expected', () => {
    it('should be acceptable if within maxOverScore', () => {
      const input: ScoreComparisonInput = {
        expectedScore: 50,
        actualScore: 100,
        maxOverScore: 100,
        maxUnderScore: 0,
      };

      const result = calculateScoreComparison(input);

      expect(result.difference).toBe(50);
      expect(result.isAcceptable).toBe(true);
      expect(result.minAllowedScore).toBe(50);
      expect(result.maxAllowedScore).toBe(150);
    });

    it('should be unacceptable if above maxOverScore', () => {
      const input: ScoreComparisonInput = {
        expectedScore: 50,
        actualScore: 200,
        maxOverScore: 100,
        maxUnderScore: 0,
      };

      const result = calculateScoreComparison(input);

      expect(result.difference).toBe(150);
      expect(result.isAcceptable).toBe(false);
    });

    it('should be acceptable at exactly maxOverScore boundary', () => {
      const input: ScoreComparisonInput = {
        expectedScore: 50,
        actualScore: 150,
        maxOverScore: 100,
        maxUnderScore: 0,
      };

      const result = calculateScoreComparison(input);

      expect(result.difference).toBe(100);
      expect(result.isAcceptable).toBe(true);
    });
  });

  describe('when actual is lower than expected', () => {
    it('should be unacceptable if below expected with maxUnderScore=0', () => {
      const input: ScoreComparisonInput = {
        expectedScore: 50,
        actualScore: 40,
        maxOverScore: 100,
        maxUnderScore: 0,
      };

      const result = calculateScoreComparison(input);

      expect(result.difference).toBe(-10);
      expect(result.isAcceptable).toBe(false);
      expect(result.minAllowedScore).toBe(50);
    });

    it('should be acceptable if within maxUnderScore', () => {
      const input: ScoreComparisonInput = {
        expectedScore: 50,
        actualScore: 40,
        maxOverScore: 100,
        maxUnderScore: 20,
      };

      const result = calculateScoreComparison(input);

      expect(result.difference).toBe(-10);
      expect(result.isAcceptable).toBe(true);
      expect(result.minAllowedScore).toBe(30);
    });

    it('should be unacceptable if below maxUnderScore', () => {
      const input: ScoreComparisonInput = {
        expectedScore: 50,
        actualScore: 20,
        maxOverScore: 100,
        maxUnderScore: 20,
      };

      const result = calculateScoreComparison(input);

      expect(result.difference).toBe(-30);
      expect(result.isAcceptable).toBe(false);
    });

    it('should be acceptable at exactly maxUnderScore boundary', () => {
      const input: ScoreComparisonInput = {
        expectedScore: 50,
        actualScore: 30,
        maxOverScore: 100,
        maxUnderScore: 20,
      };

      const result = calculateScoreComparison(input);

      expect(result.difference).toBe(-20);
      expect(result.isAcceptable).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle zero scores', () => {
      const input: ScoreComparisonInput = {
        expectedScore: 0,
        actualScore: 0,
        maxOverScore: 100,
        maxUnderScore: 0,
      };

      const result = calculateScoreComparison(input);

      expect(result.difference).toBe(0);
      expect(result.isAcceptable).toBe(true);
    });

    it('should handle negative expected score', () => {
      const input: ScoreComparisonInput = {
        expectedScore: -10,
        actualScore: 0,
        maxOverScore: 100,
        maxUnderScore: 0,
      };

      const result = calculateScoreComparison(input);

      expect(result.difference).toBe(10);
      expect(result.isAcceptable).toBe(true);
      expect(result.minAllowedScore).toBe(-10);
      expect(result.maxAllowedScore).toBe(90);
    });

    it('should handle large scores', () => {
      const input: ScoreComparisonInput = {
        expectedScore: 10000,
        actualScore: 9500,
        maxOverScore: 100,
        maxUnderScore: 500,
      };

      const result = calculateScoreComparison(input);

      expect(result.difference).toBe(-500);
      expect(result.isAcceptable).toBe(true);
    });
  });
});

describe('handleScoreResult', () => {
  const mockTagConfig: TagConfig = {
    enabled: true,
    successTag: 'quality-ok',
    mismatchTag: 'quality-mismatch',
  };

  const mockQualityConfig: QualityConfig = {
    maxOverScore: 100,
    maxUnderScore: 0,
  };

  function createMockServices(): ScoreResultServices {
    return {
      radarr: {
        getMovie: vi.fn().mockResolvedValue({ id: 1, title: 'Test', year: 2024, tags: [] }),
        getOrCreateTag: vi.fn().mockResolvedValue({ id: 10, label: 'test-tag' }),
        addTagToMovie: vi.fn().mockResolvedValue({}),
      },
      discord: {
        sendScoreMismatch: vi.fn().mockResolvedValue(undefined),
      },
    };
  }

  function createAcceptableComparison(): ScoreComparisonResult {
    return {
      expectedScore: 50,
      actualScore: 50,
      difference: 0,
      minAllowedScore: 50,
      maxAllowedScore: 150,
      isAcceptable: true,
    };
  }

  function createMismatchComparison(): ScoreComparisonResult {
    return {
      expectedScore: 50,
      actualScore: 30,
      difference: -20,
      minAllowedScore: 50,
      maxAllowedScore: 150,
      isAcceptable: false,
    };
  }

  it('should apply success tag when score is acceptable', async () => {
    const services = createMockServices();
    const context: ScoreResultContext = {
      movie: { id: 1, title: 'Test Movie', year: 2024 },
      quality: 'Bluray-1080p',
      comparison: createAcceptableComparison(),
    };

    const result = await handleScoreResult(
      context,
      { tagConfig: mockTagConfig, qualityConfig: mockQualityConfig },
      services
    );

    expect(result.tagApplied).toBe('quality-ok');
    expect(result.notificationSent).toBe(false);
    expect(services.radarr.getOrCreateTag).toHaveBeenCalledWith('quality-ok');
    expect(services.radarr.addTagToMovie).toHaveBeenCalled();
    expect(services.discord.sendScoreMismatch).not.toHaveBeenCalled();
  });

  it('should apply mismatch tag and send notification when score is unacceptable', async () => {
    const services = createMockServices();
    const context: ScoreResultContext = {
      movie: { id: 1, title: 'Test Movie', year: 2024 },
      quality: 'Bluray-1080p',
      comparison: createMismatchComparison(),
    };

    const result = await handleScoreResult(
      context,
      { tagConfig: mockTagConfig, qualityConfig: mockQualityConfig },
      services
    );

    expect(result.tagApplied).toBe('quality-mismatch');
    expect(result.notificationSent).toBe(true);
    expect(services.radarr.getOrCreateTag).toHaveBeenCalledWith('quality-mismatch');
    expect(services.discord.sendScoreMismatch).toHaveBeenCalledWith({
      title: 'Test Movie',
      year: 2024,
      expectedScore: 50,
      actualScore: 30,
      difference: -20,
      maxOverScore: 100,
      quality: 'Bluray-1080p',
    });
  });

  it('should not apply tag when tagging is disabled', async () => {
    const services = createMockServices();
    const context: ScoreResultContext = {
      movie: { id: 1, title: 'Test Movie', year: 2024 },
      quality: 'Bluray-1080p',
      comparison: createAcceptableComparison(),
    };
    const disabledTagConfig: TagConfig = { ...mockTagConfig, enabled: false };

    const result = await handleScoreResult(
      context,
      { tagConfig: disabledTagConfig, qualityConfig: mockQualityConfig },
      services
    );

    expect(result.tagApplied).toBeNull();
    expect(services.radarr.getOrCreateTag).not.toHaveBeenCalled();
    expect(services.radarr.addTagToMovie).not.toHaveBeenCalled();
  });
});

describe('logScoreComparison', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should log all comparison details', () => {
    const comparison: ScoreComparisonResult = {
      expectedScore: 50,
      actualScore: 40,
      difference: -10,
      minAllowedScore: 50,
      maxAllowedScore: 150,
      isAcceptable: false,
    };

    logScoreComparison(comparison);

    expect(consoleSpy).toHaveBeenCalled();
    const allCalls = consoleSpy.mock.calls.map(call => call[0]).join(' ');
    expect(allCalls).toContain('50');
    expect(allCalls).toContain('40');
    expect(allCalls).toContain('-10');
  });

  it('should include prefix when provided', () => {
    const comparison: ScoreComparisonResult = {
      expectedScore: 50,
      actualScore: 50,
      difference: 0,
      minAllowedScore: 50,
      maxAllowedScore: 150,
      isAcceptable: true,
    };

    logScoreComparison(comparison, '[TEST]');

    const allCalls = consoleSpy.mock.calls.map(call => call[0]).join(' ');
    expect(allCalls).toContain('[TEST]');
  });
});

describe('logDryRunResult', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should log success tag for acceptable score', () => {
    const comparison: ScoreComparisonResult = {
      expectedScore: 50,
      actualScore: 50,
      difference: 0,
      minAllowedScore: 50,
      maxAllowedScore: 150,
      isAcceptable: true,
    };
    const tagConfig: TagConfig = {
      enabled: true,
      successTag: 'quality-ok',
      mismatchTag: 'quality-mismatch',
    };

    logDryRunResult(comparison, tagConfig);

    const allCalls = consoleSpy.mock.calls.map(call => call[0]).join(' ');
    expect(allCalls).toContain('DRY-RUN');
    expect(allCalls).toContain('quality-ok');
  });

  it('should log mismatch tag and Discord notification for unacceptable score', () => {
    const comparison: ScoreComparisonResult = {
      expectedScore: 50,
      actualScore: 30,
      difference: -20,
      minAllowedScore: 50,
      maxAllowedScore: 150,
      isAcceptable: false,
    };
    const tagConfig: TagConfig = {
      enabled: true,
      successTag: 'quality-ok',
      mismatchTag: 'quality-mismatch',
    };

    logDryRunResult(comparison, tagConfig);

    const allCalls = consoleSpy.mock.calls.map(call => call[0]).join(' ');
    expect(allCalls).toContain('DRY-RUN');
    expect(allCalls).toContain('quality-mismatch');
    expect(allCalls).toContain('Discord');
  });
});
