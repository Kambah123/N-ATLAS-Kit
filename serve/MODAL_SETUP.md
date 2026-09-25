# Setting up Modal for N-ATLaS

Everything else in this repo depends on a real endpoint, so do this first.
Budget **30–40 minutes**, most of it waiting for Hugging Face access approvals.

At the end you will have run `modal run serve/modal_preflight.py` and seen it
print `READY` — which proves your account, your GPU access and your Hugging
Face token all work, *before* we write the deployment that costs real money.

---

## Step 0 — Before you touch Modal: get Hugging Face access

Do this first, because gated-repo approval is the only step you don't control.
All five NCAIR1 repos are gated — Modal cannot download a single byte without
an approved token.

1. Create or log into a Hugging Face account: <https://huggingface.co/join>

2. Open **all five** model pages and click the button to accept the terms.
   You will see *"You need to agree to share your contact information to access
   this model."* Missing even one breaks the deploy at model-load time.

   - <https://huggingface.co/NCAIR1/N-ATLaS>
   - <https://huggingface.co/NCAIR1/Hausa-ASR>
   - <https://huggingface.co/NCAIR1/Igbo-ASR>
   - <https://huggingface.co/NCAIR1/Yoruba-ASR>
   - <https://huggingface.co/NCAIR1/NigerianAccentedEnglish>

   All five are set to **auto-approve** (`gated: auto`), so access should be
   instant. If one sits in "pending", that is the one to chase.

3. Create a token at <https://huggingface.co/settings/tokens>.

   Choose **Read** (or a fine-grained token with *"Read access to contents of
   all public gated repos you can access"*). It looks like `hf_xxxxxxxx…`.

   **Copy it now** — Hugging Face shows it once.

4. Put it in your local `.env` (git-ignored, never committed):

   ```bash
   cd N-ATLAS-Kit
   cp .env.example .env
   # edit .env and set:  HF_TOKEN=hf_xxxxxxxx
   ```

---

## Step 1 — Create the Modal account

<https://modal.com/signup> — sign up with GitHub or Google.

You land on the **Starter** plan:

| | Starter | Team |
|---|---|---|
| Platform fee | **$0** | $250/mo |
| Free compute credits | **$30/month** | $100/month |
| Workspace seats | 3 | Unlimited |
| Concurrent containers / GPUs | 100 / 10 | 1,000 / 50 |
| Log retention | 1 day | 30 days |

Starter is the right plan for us. $30/month of free credit is about **27 hours
of A10 time** — plenty for building, the beta test and the demo video.

> **Note the 1-day log retention.** For the NAIC submission we need evidence of
> real usage, so don't rely on Modal's logs for that — the playground writes its
> own anonymous counters, and `docs/evidence/` captures dated outputs.

### ⚠️ You must add a payment method

Modal's docs are explicit: *"Using a GPU requires having a valid payment method
on file."* The $30 credit does not bypass this. No card, no GPU.

<https://modal.com/settings/billing>

**If you are paying from Nigeria**, this is the step most likely to bite. Modal
bills in USD through Stripe, and many Nigerian naira cards are blocked for
international online payments or have a very low monthly FX limit. Options that
work, in rough order of hassle:

- A **dollar virtual card** from Chipper Cash, Grey, Geegpay, Cleva or similar —
  fund it with about $5, which is enough to satisfy the card check.
- A **domiciliary account card** from your bank (GTBank, Access, Zenith) with
  international transactions enabled.
- Any teammate's or co-founder's card — Modal workspaces support up to 3 seats
  on Starter, so you can share one workspace.

Add the card **before** you run the pre-flight, or the GPU check will fail with
a scheduling error and you'll think something else is wrong.

---

## Step 2 — Install and authenticate the CLI

```bash
pip install modal
modal setup
```

`modal setup` opens a browser and writes a token to `~/.modal.toml`. That file
holds a credential — it's already in our `.gitignore`, keep it out of git.

If the browser doesn't open (a headless box, WSL, a server over SSH):

```bash
modal token new          # prints a URL to open manually
```

Verify:

```bash
modal profile current
modal app list           # empty is fine, it just proves auth works
```

---

## Step 3 — Give Modal your Hugging Face token

Modal Secrets are encrypted key-value pairs injected as environment variables.
The token never appears in your code or in git.

```bash
modal secret create natlas-hf HF_TOKEN=hf_xxxxxxxxxxxx
```

Or, reading from your `.env` so the token never touches your shell history:

```bash
set -a && source .env && set +a
modal secret create natlas-hf HF_TOKEN="$HF_TOKEN"
```

Check it:

```bash
modal secret list
```

The name **`natlas-hf`** matters — `modal_preflight.py` and, later,
`modal_app.py` look it up by that exact name.

> You can also create it in the dashboard at <https://modal.com/secrets>;
> there is a Hugging Face template.

---

## Step 4 — Run the pre-flight

```bash
modal run serve/modal_preflight.py
```

This is the payoff. In about two minutes and for a few cents it verifies the
whole chain end to end:

1. Modal CLI is authenticated and can schedule work
2. `HF_TOKEN` actually arrives inside the container
3. That token can read **all five** gated repos (it downloads each
   `config.json` — a few KB, not the weights)
4. Modal will give you a GPU, and that GPU has room for N-ATLaS *plus* the four
   ASR models, with a real KV-cache budget computed from the model config

Useful variants:

```bash
modal run serve/modal_preflight.py --skip-gpu    # HF check only; free, no card needed
modal run serve/modal_preflight.py --gpu L4      # the cheap option
modal run serve/modal_preflight.py --gpu L40S    # 48 GB, roomy
```

If you have not sorted the card out yet, run `--skip-gpu` now to confirm the
Hugging Face half works, and come back for the GPU half.

### What good looks like

```
1. Hugging Face access to the five gated NCAIR1 repos
  ✓ HF_TOKEN reached the container (account: your-hf-username)
  ✓ NCAIR1/N-ATLaS                        config.json, 826 bytes
  ✓ NCAIR1/Hausa-ASR                      config.json, ...
  ...
2. GPU allocation and VRAM headroom (requested: A10)
  ✓ Got a NVIDIA A10
      total VRAM               22.19 GiB
      N-ATLaS weights (BF16)   14.96 GiB
      4x Whisper Small (fp16)   1.82 GiB
      ...
✓ READY.
```

### When it fails

| Symptom | Cause | Fix |
|---|---|---|
| `HF_TOKEN is empty inside the container` | Secret missing or misnamed | `modal secret create natlas-hf HF_TOKEN=hf_...` — the name must be exactly `natlas-hf` |
| `GATED - this HF account has not accepted the terms` | You accepted with a different HF account than the one that owns the token | Open the listed URL while logged in as the token's owner |
| `NOT FOUND` | Typo in the repo id, or a token with too narrow a scope | Use a plain **Read** token |
| `Could not get a GPU` and the message mentions a payment method | No payment method | <https://modal.com/settings/billing> — see the Nigeria notes above |
| `Function.with_options` / `modal >= 1.4.3` | The installed `modal` client is older than 1.4.3, so `--gpu` cannot be applied. This is not a billing error. The script still runs the pinned A10 check. | `pip install -U 'modal>=1.4.3'`, or rerun without `--gpu` |
| `Could not get a GPU` with any other message | Read that message. Quota, an unknown GPU name, or a workspace restriction are all possible. | Fix the cause it names |
| `Token missing` / `not authenticated` | `modal setup` not completed | Re-run `modal setup` |

---

## Step 5 — Choosing the GPU (decide before we write `modal_app.py`)

N-ATLaS is a Llama-3 8B in BF16 — **14.96 GiB of weights**. The four Whisper
Small models add **1.82 GiB** in fp16. With about 2 GiB of CUDA/runtime
overhead, we need roughly **18.8 GiB** before a single token of KV cache.

The KV cache is the number that decides concurrency. From the real config
(32 layers × 8 KV heads × 128 head dim × 2 for K and V × 2 bytes) that is
**128 KiB per token**, so one full 8,092-token conversation costs **0.99 GiB**.

| GPU | VRAM | Modal `gpu=` | $/hr | KV headroom | Verdict |
|---|---|---|---|---|---|
| **L4** | 24 GB | `"L4"` | **$0.80** | ~4.7 GiB | Cheapest that fits. ~300 GB/s memory bandwidth, so noticeably slower token generation. Fine for the SDKs, docs and CI. |
| **A10** | 24 GB | `"A10"` | **$1.10** | ~4.7 GiB | ~600 GB/s, roughly 2× the L4's generation speed. **Best default** — the demo video and beta testers need it to feel snappy. |
| **L40S** | 48 GB | `"L40S"` | $1.95 | ~29 GiB | Lots of room, comfortably handles the playground under load. Overkill until launch day. |
| A100 40GB | 40 GB | `"A100-40GB"` | $2.10 | ~21 GiB | Worse value than L40S here. Skip. |

> Your brief said "A10G or L4". Modal's current GPU string is **`A10`**, not
> `A10G` — `A10G` was the older name and is no longer in their list. The
> pre-flight and `modal_app.py` use `A10`.

**My recommendation: `A10` as the default, with `L4` as a fallback.** Modal
supports a preference list, so if no A10 is free you get an L4 instead of
queueing:

```python
@app.cls(gpu=["A10", "L4"], ...)
```

### What it will actually cost you

Modal bills **per second** and scales to zero, so you only pay while a request
is in flight plus the scaledown window.

| Activity | Rough cost |
|---|---|
| This pre-flight | **< $0.05** |
| A day of development (container warm ~2 hrs on A10) | ~$2.20 |
| Beta testers, 5 people × 45 min of bursty use | ~$1–3 total |
| Recording the demo video (1 hr warm) | ~$1.10 |
| Keeping it always-warm for 24 h (don't) | ~$26 |

The whole 18-day build should land **inside the $30/month free credit** as long
as you let it scale to zero. The one thing that will burn the credit is setting
`min_containers=1` and forgetting — only do that for the hour around a judged
demo, and turn it off after.

---

## Step 6 — Then what

Once the pre-flight prints `READY`, we build the real thing:

```
serve/modal_app.py      vLLM serving NCAIR1/N-ATLaS + the FastAPI ASR server
                        + the gateway, on one GPU, behind one base URL
```

deployed with:

```bash
modal deploy serve/modal_app.py
```

which prints a public URL like
`https://<your-workspace>--natlas-gateway.modal.run`. That becomes your
`NATLAS_BASE_URL` for the SDKs, the playground and the examples.

---

## Security notes

- `~/.modal.toml` and `.env` are both git-ignored. Never commit either.
- The HF token lives **only** in the Modal Secret and your local `.env`. It is
  never baked into a container image or printed in logs.
- The gateway's own API keys (`NATLAS_API_KEYS`) are separate from your HF
  token — rotate them freely without touching Hugging Face.
- Generate a gateway key with `openssl rand -hex 32`.

## Licence reminder

Deploying this makes you a licensee of the N-ATLaS Terms of Use: attribution is
mandatory, there is a cap of **1,000 active end-users per rolling 30 days**, and
commercial or enterprise deployment needs a separate agreement with Awarri.
See [`NOTICE`](../NOTICE).
