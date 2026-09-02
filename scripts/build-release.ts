import { createHash } from "node:crypto"
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import matter from "gray-matter"
import { create as createTar } from "tar"

const ROOT = join(import.meta.dirname, "..")
const SKILLS_DIR = join(ROOT, "skills")
const DIST_DIR = join(ROOT, "dist")
const SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json"
const SKILL_NAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, RELEASE_TAG } = process.env

if (!GITHUB_SERVER_URL || !GITHUB_REPOSITORY || !RELEASE_TAG) {
  throw new Error(
    "Missing required env: GITHUB_SERVER_URL, GITHUB_REPOSITORY, RELEASE_TAG"
  )
}

function skillUrl(name: string): string {
  return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/releases/download/${RELEASE_TAG}/${name}.tar.gz`
}

function listFiles(dir: string, prefix = ""): string[] {
  const files: string[] = []
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  )

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

    if (entry.isSymbolicLink()) {
      throw new Error(`Symlinks are not allowed in release archives: ${relativePath}`)
    }

    if (entry.isDirectory()) {
      files.push(...listFiles(join(dir, entry.name), relativePath))
    } else if (entry.isFile()) {
      files.push(relativePath)
    } else {
      throw new Error(`Unsupported file type in release archive: ${relativePath}`)
    }
  }

  return files
}

function sha256File(filePath: string): string {
  const hash = createHash("sha256").update(readFileSync(filePath)).digest("hex")
  return `sha256:${hash}`
}

rmSync(DIST_DIR, { recursive: true, force: true })
mkdirSync(DIST_DIR, { recursive: true })

const skillNames = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

if (skillNames.length === 0) {
  throw new Error(`No skill directories found in ${SKILLS_DIR}`)
}

const skills: Array<{
  name: string
  type: "archive"
  description: string
  url: string
  digest: string
}> = []

for (const directoryName of skillNames) {
  const skillDir = join(SKILLS_DIR, directoryName)
  const skillMdPath = join(skillDir, "SKILL.md")
  const { data } = matter(readFileSync(skillMdPath, "utf8"))

  if (
    typeof data.name !== "string" ||
    data.name.length > 64 ||
    data.name.includes("--") ||
    !SKILL_NAME.test(data.name)
  ) {
    throw new Error(`Missing or invalid 'name' in frontmatter: ${skillMdPath}`)
  }

  if (data.name !== directoryName) {
    throw new Error(
      `Skill name '${data.name}' must match directory '${directoryName}'`
    )
  }

  if (
    typeof data.description !== "string" ||
    data.description.length < 1 ||
    data.description.length > 1024
  ) {
    throw new Error(
      `Description must contain 1-1024 characters: ${skillMdPath}`
    )
  }

  const files = listFiles(skillDir)
  const artifactPath = join(DIST_DIR, `${data.name}.tar.gz`)

  await createTar(
    {
      gzip: true,
      file: artifactPath,
      cwd: skillDir,
      portable: true,
      mtime: new Date(0),
    },
    files
  )

  const digest = sha256File(artifactPath)

  skills.push({
    name: data.name,
    type: "archive",
    description: data.description,
    url: skillUrl(data.name),
    digest,
  })
  console.log(`  ${data.name}: ${digest}`)
}

writeFileSync(
  join(DIST_DIR, "index.json"),
  `${JSON.stringify({ $schema: SCHEMA, skills }, null, 2)}\n`
)

console.log(`\nWrote dist/index.json with ${skills.length} skill(s)`)
