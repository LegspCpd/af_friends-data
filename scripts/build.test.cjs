const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'friends-build-test-'));
  try {
    for (const folder of ['scripts', 'data/friends', 'data/sponsors', 'dist']) {
      fs.mkdirSync(path.join(root, folder), { recursive: true });
    }
    fs.copyFileSync(__filename.replace('build.test.cjs', 'build.js'), path.join(root, 'scripts/build.js'));
    fs.writeFileSync(path.join(root, 'dist/friends.json'), 'original-friends');
    fs.writeFileSync(path.join(root, 'dist/sponsors.json'), 'original-sponsors');
    run(root, () => spawnSync(process.execPath, ['scripts/build.js'], { cwd: root, encoding: 'utf8' }));
  } finally {
    const resolved = path.resolve(root);
    const temp = path.resolve(os.tmpdir()) + path.sep;
    if (!resolved.startsWith(temp) || !path.basename(resolved).startsWith('friends-build-test-')) {
      throw new Error('Refusing cleanup outside the isolated test directory');
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

test('invalid sponsors do not replace either existing output', () => fixture((root, build) => {
  fs.writeFileSync(path.join(root, 'data/friends/valid.json'), JSON.stringify({ name: 'friend', avatar: null, url: 'https://example.com' }));
  fs.writeFileSync(path.join(root, 'data/sponsors/invalid.json'), '{broken');
  assert.notEqual(build().status, 0);
  assert.equal(fs.readFileSync(path.join(root, 'dist/friends.json'), 'utf8'), 'original-friends');
  assert.equal(fs.readFileSync(path.join(root, 'dist/sponsors.json'), 'utf8'), 'original-sponsors');
}));

test('schema-invalid entries block output instead of silently disappearing', () => fixture((root, build) => {
  fs.writeFileSync(path.join(root, 'data/friends/invalid.json'), JSON.stringify({ name: 'friend' }));
  assert.notEqual(build().status, 0);
  assert.equal(fs.readFileSync(path.join(root, 'dist/friends.json'), 'utf8'), 'original-friends');
}));

test('current source records still build successfully in an isolated directory', () => fixture((root, build) => {
  for (const kind of ['friends', 'sponsors']) {
    fs.cpSync(path.join(__dirname, '../data', kind), path.join(root, 'data', kind), { recursive: true });
  }
  const result = build();
  assert.equal(result.status, 0, result.stderr);
  for (const kind of ['friends', 'sponsors']) {
    const inputCount = fs.readdirSync(path.join(root, 'data', kind)).filter(name => name.endsWith('.json')).length;
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'dist', `${kind}.json`))).length, inputCount);
  }
}));
