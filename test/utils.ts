import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

/**
 * Create a temporary directory for testing
 * @returns Path to the temporary directory
 */
export const createTempDir = async (): Promise<string> => {
  return await mkdtemp(join(tmpdir(), "growi-uploader-test-"));
};

/**
 * Create test files in a directory
 * @param dir Base directory
 * @param files Object mapping file paths to content
 */
export const createTestFiles = async (
  dir: string,
  files: Record<string, string>,
): Promise<void> => {
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(dir, path);
    const dirPath = dirname(fullPath);
    await mkdir(dirPath, { recursive: true });
    await writeFile(fullPath, content, "utf-8");
  }
};

/**
 * Clean up temporary directory
 * @param dir Directory to remove
 */
export const cleanupTempDir = async (dir: string): Promise<void> => {
  await rm(dir, { recursive: true, force: true });
};
