# Releasing `n-atlas` and `natlas`

You publish both packages from GitHub. You do not need to run `npm publish` or `twine upload` on your laptop.

The first versions in the repo are **0.1.0**. The npm name is `n-atlas`. The PyPI name is `natlas`.

Do these steps in order. Finish the npm steps, then the PyPI steps, then press the button.

## 1. Put the workflow on `main`

Merge the pull request that adds `.github/workflows/release.yml`. GitHub only shows the **Release** workflow after that file is on the default branch.

The repository must stay **public**. npm provenance and the GitHub install commands both need a public repo.

## 2. Create an npm account

1. Open <https://www.npmjs.com/signup> and create an account.
2. Turn on two-factor authentication when npm asks. The Actions workflow uses a token, so you will not type a one-time code during publish.

## 3. Create a Granular Access Token

1. Sign in at <https://www.npmjs.com>.
2. Open your avatar → **Access Tokens** → **Generate New Token** → **Granular Access Token**.
3. Name it something you will recognise, such as `n-atlas-github-actions`.
4. Give it **publish** rights for **all packages**. The package does not exist yet, so a token limited to one package name cannot create `n-atlas`.
5. Copy the token. npm shows it once.

## 4. Save the token as `NPM_TOKEN`

1. Open <https://github.com/Kambah123/N-ATLAS-Kit/settings/secrets/actions>.
2. **New repository secret**.
3. Name: `NPM_TOKEN` (exactly that, all caps).
4. Value: the token you copied.
5. **Add secret**.

If this secret is missing, the JavaScript job still turns green and prints that it skipped npm publish. Nothing is published until you add the secret and run the workflow again.

## 5. Create a PyPI account

1. Open <https://pypi.org/account/register/> and create an account.
2. Turn on two-factor authentication. PyPI Trusted Publishing does not use an API token, so you will not paste a PyPI password into GitHub.

## 6. Add a pending Trusted Publisher

Do this **before** the first publish. `natlas` is not on PyPI yet, so this is a **pending** publisher, not a publisher on an existing project.

1. Open <https://pypi.org/manage/account/publishing/>.
2. Under **Add a new pending publisher**, fill in:

| Field             | Value         |
| ----------------- | ------------- |
| PyPI project name | `natlas`      |
| Owner             | `Kambah123`   |
| Repository name   | `N-ATLAS-Kit` |
| Workflow name     | `release.yml` |
| Environment name  | `pypi`        |

3. Save it.

The workflow file is `.github/workflows/release.yml`. PyPI asks for the file name only: `release.yml`. The environment name must be `pypi`, lowercase, because that is the GitHub environment the Python job uses. Leave the token fields empty. This project does not use a PyPI API token.

## 7. Run the workflow

1. Open <https://github.com/Kambah123/N-ATLAS-Kit/actions>.
2. Click **Release** in the left sidebar.
3. Click **Run workflow**.
4. Branch: `main`.
5. **Which packages to publish**: `both` the first time. Choose `js` or `python` if you only want one.
6. Click the green **Run workflow** button.
7. Open the run. **Publish n-atlas (npm)** and **Publish natlas (PyPI)** should both succeed.

When they do, these pages exist:

- <https://www.npmjs.com/package/n-atlas>
- <https://pypi.org/project/natlas/>

## Tags, if you would rather not press the button

Pushing a tag also publishes the version that is already in the files on that commit.

```bash
git tag js-v0.1.0
git push origin js-v0.1.0
```

```bash
git tag py-v0.1.0
git push origin py-v0.1.0
```

`js-v*` publishes npm only. `py-v*` publishes PyPI only. The tag name does not set the version. `package.json` and `pyproject.toml` do.

## The next version

npm and PyPI reject a second upload of the same version. Before you publish again, set the same new version in all four places:

- `packages/js-sdk/package.json` (`version`)
- `packages/js-sdk/src/version.ts` (`VERSION`)
- `packages/python-sdk/pyproject.toml` (`version`)
- `packages/python-sdk/src/natlas/version.py` (`__version__`)

Put a note in `CHANGELOG.md`, merge to `main`, then run **Release** again.

## If a job fails

- **npm says `ENEEDAUTH` or `404`.** `NPM_TOKEN` is missing, expired, or does not have publish rights for all packages. Make a new granular token and update the secret.
- **The JavaScript job is green but says `NPM_TOKEN is not set`.** The secret name is wrong, or it was added to an environment instead of the repository. It must be a repository secret named `NPM_TOKEN`.
- **PyPI says the trusted publisher is not permitted.** The pending publisher fields do not match the table above, or you created a normal publisher on a project that does not exist yet. Delete it and add a pending publisher again.
- **`File already exists` / `cannot publish over previously published versions`.** 0.1.0 is already up. Bump the four version files, merge, and run the workflow again.
