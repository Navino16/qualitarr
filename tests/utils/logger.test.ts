import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, setLogLevel } from '../../src/utils/logger.js';

describe('logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setLogLevel('debug');
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    setLogLevel('info');
  });

  describe('setLogLevel', () => {
    it('should filter out debug logs when level is info', () => {
      setLogLevel('info');

      logger.debug('debug message');

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should show info logs when level is info', () => {
      setLogLevel('info');

      logger.info('info message');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0]?.[0]).toContain('[INFO]');
      expect(consoleSpy.mock.calls[0]?.[0]).toContain('info message');
    });

    it('should filter out info and debug when level is warn', () => {
      setLogLevel('warn');

      logger.debug('debug message');
      logger.info('info message');

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should show warn logs when level is warn', () => {
      setLogLevel('warn');

      logger.warn('warn message');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0]?.[0]).toContain('[WARN]');
    });

    it('should only show error when level is error', () => {
      setLogLevel('error');

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error message');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0]?.[0]).toContain('[ERROR]');
    });
  });

  describe('log methods', () => {
    it('should log debug messages with DEBUG prefix', () => {
      logger.debug('test debug');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0]?.[0]).toContain('[DEBUG]');
      expect(consoleSpy.mock.calls[0]?.[0]).toContain('test debug');
    });

    it('should log info messages with INFO prefix', () => {
      logger.info('test info');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0]?.[0]).toContain('[INFO]');
      expect(consoleSpy.mock.calls[0]?.[0]).toContain('test info');
    });

    it('should log warn messages with WARN prefix', () => {
      logger.warn('test warn');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0]?.[0]).toContain('[WARN]');
      expect(consoleSpy.mock.calls[0]?.[0]).toContain('test warn');
    });

    it('should log error messages with ERROR prefix', () => {
      logger.error('test error');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0]?.[0]).toContain('[ERROR]');
      expect(consoleSpy.mock.calls[0]?.[0]).toContain('test error');
    });

    it('should include timestamp in ISO format', () => {
      logger.info('test');

      const logOutput = consoleSpy.mock.calls[0]?.[0] as string;
      expect(logOutput).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should log additional data when provided', () => {
      const data = { key: 'value' };
      logger.info('with data', data);

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0]?.[1]).toEqual(data);
    });

    it('should not pass data argument when not provided', () => {
      logger.info('without data');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0]).toHaveLength(1);
    });
  });
});
