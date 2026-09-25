# Support-reply helper

A small customer-support tool. You paste a message a customer sent in Hausa,
Igbo, Yorùbá, or Nigerian English. The script asks N-ATLaS (`NCAIR1/N-ATLaS`)
which of those four languages it is, unless you already passed `--language`,
then asks N-ATLaS for a short reply in that language.

The system prompt says not to invent order numbers, refunds, delivery dates,
prices, or policies, and to ask one question when the message is thin. The
paragraph that comes back is still the model's. This program does not look up
orders, and it does not ship a canned reply. If the gateway is not configured,
it exits with `No N-ATLAS backend connected` and sends nothing.

## Setup

Python 3.10 or newer, from the repository root:

```bash
pip install natlas

export NATLAS_BASE_URL=https://kambah123--natlas-serve-natlasservice-serve.modal.run
export NATLAS_API_KEY=your-gateway-key
```

See [`.env.example`](./.env.example). The demo gateway scales to zero; a cold
start can exceed the default 60 second client timeout (`NATLAS_TIMEOUT_MS`
is milliseconds). The API key is the Bearer token in the Modal secret
`natlas-api`, not a Hugging Face token, and it is not stored in this repo.

## Run

```bash
python examples/support-reply/reply.py \
  --message "My transfer has not arrived" \
  --language en

python examples/support-reply/reply.py --file customer.txt
```

Without `--language`, the script calls `detect_language`. If the model does
not answer with `ha`, `ig`, `yo`, or `en`, the script stops and tells you to
pass `--language`. It does not guess.

Output looks like:

```text
language: en (given)
model: <model id the gateway returned>
---
<the reply text the gateway returned>
---
N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies.
```

There is no sample reply in this README, because that would be a fabricated
model output.

## Tests

```bash
python -m unittest examples/support-reply/test_reply.py
```

The tests use a fake client. One test imports `natlas` and checks the model
ids, so install the SDK first. They do not call the network.
