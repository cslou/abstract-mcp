import { describe, it, expect } from 'vitest';
import { 
  detectFileFormat,
  parseCSVContent,
  parseFileContent,
  mergeFileDataWithArgs
} from '../../src/core.js';

describe('detectFileFormat', () => {
  it('should detect format by file extension', () => {
    expect(detectFileFormat('/path/to/file.json')).toBe('json');
    expect(detectFileFormat('/path/to/file.csv')).toBe('csv');
    expect(detectFileFormat('/path/to/file.tsv')).toBe('tsv');
    expect(detectFileFormat('/path/to/file.yaml')).toBe('yaml');
    expect(detectFileFormat('/path/to/file.yml')).toBe('yaml');
    expect(detectFileFormat('/path/to/file.xml')).toBe('xml');
    expect(detectFileFormat('/path/to/file.txt')).toBe('txt');
  });

  it('should default to txt for unknown extensions', () => {
    expect(detectFileFormat('/path/to/file.unknown')).toBe('txt');
    expect(detectFileFormat('/path/to/file')).toBe('txt');
  });

  it('should be case insensitive', () => {
    expect(detectFileFormat('/path/to/file.JSON')).toBe('json');
    expect(detectFileFormat('/path/to/file.CSV')).toBe('csv');
    expect(detectFileFormat('/path/to/file.YAML')).toBe('yaml');
  });
});

describe('parseCSVContent', () => {
  it('should parse simple CSV with headers', () => {
    const csvContent = 'name,email,age\nJohn,john@test.com,30\nJane,jane@test.com,25';
    const result = parseCSVContent(csvContent);
    
    expect(result).toEqual([
      { name: 'John', email: 'john@test.com', age: '30' },
      { name: 'Jane', email: 'jane@test.com', age: '25' }
    ]);
  });

  it('should handle empty cells', () => {
    const csvContent = 'name,email,age\nJohn,,30\nJane,jane@test.com,';
    const result = parseCSVContent(csvContent);
    
    expect(result).toEqual([
      { name: 'John', email: '', age: '30' },
      { name: 'Jane', email: 'jane@test.com', age: '' }
    ]);
  });

  it('should handle quoted values with commas', () => {
    const csvContent = 'name,description,age\n"John, Jr.","Has, many, commas",30\nJane,Simple,25';
    const result = parseCSVContent(csvContent);
    
    expect(result).toEqual([
      { name: 'John, Jr.', description: 'Has, many, commas', age: '30' },
      { name: 'Jane', description: 'Simple', age: '25' }
    ]);
  });

  it('should handle escaped quotes', () => {
    const csvContent = 'name,description\n"John ""Jr""","He said ""Hello"""\nJane,Normal';
    const result = parseCSVContent(csvContent);
    
    expect(result).toEqual([
      { name: 'John "Jr"', description: 'He said "Hello"' },
      { name: 'Jane', description: 'Normal' }
    ]);
  });

  it('should skip empty rows', () => {
    const csvContent = 'name,email\nJohn,john@test.com\n\nJane,jane@test.com\n\n';
    const result = parseCSVContent(csvContent);
    
    expect(result).toEqual([
      { name: 'John', email: 'john@test.com' },
      { name: 'Jane', email: 'jane@test.com' }
    ]);
  });

  it('should error on empty file', () => {
    expect(() => parseCSVContent('')).toThrow('CSV file is empty');
    expect(() => parseCSVContent('   \n  \n')).toThrow('CSV file is empty');
  });

  it('should error on headers only', () => {
    expect(() => parseCSVContent('name,email,age')).toThrow('CSV file contains only headers, no data rows');
  });

  it('should error on malformed rows', () => {
    const csvContent = 'name,email,age\nJohn,john@test.com,30\nJane,jane@test.com'; // Missing age
    expect(() => parseCSVContent(csvContent)).toThrow('Row 3 has 2 columns, expected 3 based on headers');
  });
});

describe('parseFileContent', () => {
  it('should parse JSON content', () => {
    const jsonContent = '{"name": "John", "age": 30}';
    const result = parseFileContent(jsonContent, 'json');
    expect(result).toEqual({ name: 'John', age: 30 });
  });

  it('should error on invalid JSON', () => {
    const invalidJson = '{"name": "John", "age":}';
    expect(() => parseFileContent(invalidJson, 'json')).toThrow('Failed to parse JSON file');
  });

  it('should parse CSV content', () => {
    const csvContent = 'name,age\nJohn,30\nJane,25';
    const result = parseFileContent(csvContent, 'csv');
    expect(result).toEqual([
      { name: 'John', age: '30' },
      { name: 'Jane', age: '25' }
    ]);
  });

  it('should parse TSV content by converting to CSV', () => {
    const tsvContent = 'name\tage\nJohn\t30\nJane\t25';
    const result = parseFileContent(tsvContent, 'tsv');
    expect(result).toEqual([
      { name: 'John', age: '30' },
      { name: 'Jane', age: '25' }
    ]);
  });

  it('should parse simple YAML content', () => {
    const yamlContent = 'name: John\nage: 30\ncity: NYC';
    const result = parseFileContent(yamlContent, 'yaml');
    expect(result).toEqual({ name: 'John', age: '30', city: 'NYC' });
  });

  it('should return XML content as-is', () => {
    const xmlContent = '<root><name>John</name></root>';
    const result = parseFileContent(xmlContent, 'xml');
    expect(result).toBe(xmlContent);
  });

  it('should try JSON parsing for txt files, fallback to text', () => {
    const jsonText = '{"name": "John"}';
    const result1 = parseFileContent(jsonText, 'txt');
    expect(result1).toEqual({ name: 'John' });

    const plainText = 'Just some text';
    const result2 = parseFileContent(plainText, 'txt');
    expect(result2).toBe('Just some text');
  });
});

describe('mergeFileDataWithArgs', () => {
  it('should return file content directly when no data_key', () => {
    const fileContent = [{ name: 'John', age: 30 }];
    const result = mergeFileDataWithArgs(fileContent, undefined, undefined);
    expect(result).toEqual(fileContent);
  });

  it('should inject file data at data_key with no tool_args', () => {
    const fileContent = [{ name: 'John', age: 30 }];
    const result = mergeFileDataWithArgs(fileContent, 'users', undefined);
    expect(result).toEqual({ users: fileContent });
  });

  it('should merge file data with existing tool_args', () => {
    const fileContent = [{ name: 'John', age: 30 }];
    const toolArgs = { table: 'employees', validate: true };
    const result = mergeFileDataWithArgs(fileContent, 'records', toolArgs);
    
    expect(result).toEqual({
      table: 'employees',
      validate: true,
      records: fileContent
    });
  });

  it('should error on data_key conflicts', () => {
    const fileContent = [{ name: 'John', age: 30 }];
    const toolArgs = { records: 'existing', table: 'employees' };
    
    expect(() => {
      mergeFileDataWithArgs(fileContent, 'records', toolArgs);
    }).toThrow("Conflict: data_key 'records' already exists in tool_args");
  });

  it('should handle complex file content types', () => {
    const fileContent = { config: { host: 'localhost', port: 5432 } };
    const toolArgs = { namespace: 'production' };
    const result = mergeFileDataWithArgs(fileContent, 'spec', toolArgs);
    
    expect(result).toEqual({
      namespace: 'production',
      spec: { config: { host: 'localhost', port: 5432 } }
    });
  });
});