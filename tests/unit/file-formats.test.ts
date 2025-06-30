import { describe, it, expect } from 'vitest';
import { 
  extractActualContent,
  extractContent,
  getFileExtension
} from '../../src/core.js';

describe('extractActualContent', () => {
  it('should extract and parse JSON from MCP text content', () => {
    const response = { content: [{ type: 'text', text: '{"name": "test", "value": 123}' }] };
    const result = extractActualContent(response);
    expect(result).toEqual({ name: 'test', value: 123 });
  });

  it('should return text as-is when not valid JSON', () => {
    const response = { content: [{ type: 'text', text: 'plain text content' }] };
    const result = extractActualContent(response);
    expect(result).toBe('plain text content');
  });

  it('should return content array for multiple items', () => {
    const response = { 
      content: [
        { type: 'text', text: 'First item' },
        { type: 'text', text: 'Second item' }
      ] 
    };
    const result = extractActualContent(response);
    expect(result).toEqual([
      { type: 'text', text: 'First item' },
      { type: 'text', text: 'Second item' }
    ]);
  });

  it('should return data as-is for non-MCP responses', () => {
    const response = { name: 'test', value: 123 };
    const result = extractActualContent(response);
    expect(result).toEqual({ name: 'test', value: 123 });
  });
});

describe('extractContent', () => {
  describe('txt format', () => {
    it('should extract text from MCP content array', () => {
      const response = { 
        content: [
          { type: 'text', text: 'First line' },
          { type: 'text', text: 'Second line' }
        ] 
      };
      const result = extractContent(response, 'txt');
      // Multiple content items are returned as JSON array since they're not a single text string
      expect(result).toContain('First line');
      expect(result).toContain('Second line');
    });

    it('should return string as-is', () => {
      const response = 'Plain text string';
      const result = extractContent(response, 'txt');
      expect(result).toBe('Plain text string');
    });
  });

  describe('csv format', () => {
    it('should convert array of objects to CSV', () => {
      const response = [
        { name: 'John', age: 25, city: 'NYC' },
        { name: 'Jane', age: 30, city: 'LA' }
      ];
      const result = extractContent(response, 'csv');
      expect(result).toBe('name,age,city\nJohn,25,NYC\nJane,30,LA');
    });

    it('should handle CSV-like text content', () => {
      const response = { content: [{ type: 'text', text: 'name,age\nJohn,25\nJane,30' }] };
      const result = extractContent(response, 'csv');
      // Non-tabular data gets stored as JSON with warning (since it can't be converted to proper CSV)
      expect(result).toBe('"name,age\\nJohn,25\\nJane,30"');
    });

    it('should escape commas and quotes in CSV values', () => {
      const response = [
        { name: 'John, Jr.', description: 'Has "quotes"' },
        { name: 'Jane', description: 'Normal text' }
      ];
      const result = extractContent(response, 'csv');
      expect(result).toContain('"John, Jr."');
      expect(result).toContain('"Has ""quotes"""');
    });
  });

  describe('tsv format', () => {
    it('should convert array to TSV format', () => {
      const response = [
        { name: 'John', age: 25 },
        { name: 'Jane', age: 30 }
      ];
      const result = extractContent(response, 'tsv');
      expect(result).toBe('name\tage\nJohn\t25\nJane\t30');
    });
  });

  describe('yaml format', () => {
    it('should convert object to YAML', () => {
      const response = { name: 'test', items: ['item1', 'item2'], config: { enabled: true } };
      const result = extractContent(response, 'yaml');
      expect(result).toContain('name: test');
      expect(result).toContain('- item1');
      expect(result).toContain('- item2');
      expect(result).toContain('config:');
      expect(result).toContain('  enabled: true');
    });

    it('should return YAML-like text as-is', () => {
      const response = { content: [{ type: 'text', text: 'name: value\nkey: data' }] };
      const result = extractContent(response, 'yaml');
      expect(result).toBe('name: value\nkey: data');
    });
  });

  describe('xml format', () => {
    it('should convert object to XML', () => {
      const response = { name: 'test', value: 123 };
      const result = extractContent(response, 'xml');
      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result).toContain('<root>');
      expect(result).toContain('<name>test</name>');
      expect(result).toContain('<value>123</value>');
      expect(result).toContain('</root>');
    });

    it('should return XML content as-is', () => {
      const xmlContent = '<?xml version="1.0"?><root><item>data</item></root>';
      const response = { content: [{ type: 'text', text: xmlContent }] };
      const result = extractContent(response, 'xml');
      expect(result).toBe(xmlContent);
    });
  });

  describe('html format', () => {
    it('should wrap plain text in HTML structure', () => {
      const response = { content: [{ type: 'text', text: 'Plain text content' }] };
      const result = extractContent(response, 'html');
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<html>');
      expect(result).toContain('<pre>Plain text content</pre>');
      expect(result).toContain('</html>');
    });

    it('should return HTML content as-is', () => {
      const htmlContent = '<html><body><h1>Title</h1></body></html>';
      const response = { content: [{ type: 'text', text: htmlContent }] };
      const result = extractContent(response, 'html');
      expect(result).toBe(htmlContent);
    });
  });

  describe('json format', () => {
    it('should extract clean JSON without metadata wrapper', () => {
      const response = { 
        content: [{ type: 'text', text: '{"name": "test", "value": 123}' }] 
      };
      const result = extractContent(response, 'json');
      const parsed = JSON.parse(result);
      expect(parsed).toEqual({ name: 'test', value: 123 });
    });

    it('should return formatted JSON for objects', () => {
      const response = { name: 'test', value: 123 };
      const result = extractContent(response, 'json');
      const parsed = JSON.parse(result);
      expect(parsed).toEqual({ name: 'test', value: 123 });
    });

    it('should handle MCP content arrays', () => {
      const response = { 
        content: [
          { type: 'text', text: 'First item' },
          { type: 'text', text: 'Second item' }
        ] 
      };
      const result = extractContent(response, 'json');
      const parsed = JSON.parse(result);
      expect(parsed).toEqual([
        { type: 'text', text: 'First item' },
        { type: 'text', text: 'Second item' }
      ]);
    });
  });
});

describe('getFileExtension', () => {
  it('should return correct extensions for each format', () => {
    expect(getFileExtension('json')).toBe('.json');
    expect(getFileExtension('csv')).toBe('.csv');
    expect(getFileExtension('tsv')).toBe('.tsv');
    expect(getFileExtension('md')).toBe('.md');
    expect(getFileExtension('txt')).toBe('.txt');
    expect(getFileExtension('html')).toBe('.html');
    expect(getFileExtension('yaml')).toBe('.yaml');
    expect(getFileExtension('xml')).toBe('.xml');
  });

  it('should default to .json for unknown formats', () => {
    expect(getFileExtension('unknown')).toBe('.json');
    expect(getFileExtension('')).toBe('.json');
  });
});