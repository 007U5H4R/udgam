# Oracle Always Free idle reclamation (TKT-27, TSK-27.6)

**Owner decision needed: Pay-As-You-Go (recommended) or the keep-busy job.** Record the choice as an
`EXE` decision in `decisions.md`. Until then, nothing burns CPU: the keep-busy line in
`deploy/cron/crontab` ships commented out.

## What Oracle says

Oracle's "Always Free Resources" page
(<https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm>) says, as read on 2026-10-06:

> Idle Always Free compute instances may be reclaimed by Oracle. Oracle will deem virtual machine and
> bare metal compute instances as idle if, during a 7-day period, the following are true:
>
> - CPU utilization for the 95th percentile is less than 20%
> - Network utilization is less than 20%
> - Memory utilization is less than 20% (applies to A1 shapes only)

The same page says an account converted to **Pay As You Go** keeps idle compute instances from being
stopped, and is not charged while every resource stays within the Always Free limits.

**How this was read.** The session's egress proxy blocks `docs.oracle.com`, so the text above comes
from search-engine excerpts of that page, taken on 2026-10-06. It matches technical-plan TSK-27.6. Oracle has
raised this threshold before (reports show 10 %, then 15 %, then 20 %). **Owner: re-read the page
before you choose**, and update this file if it has changed.

## What it means for Udgam

All three conditions must hold for a whole week before an instance counts as idle. A pilot at one FPO
will look idle on all three:

- **CPU.** The app is idle between pickings. Captures and checks take seconds, a few times a day.
- **Network.** A few photos a day is far below 20 % of the A1 shape's bandwidth.
- **Memory.** The app, Caddy and (optionally) Anvil use well under 2.4 GB of the 12 GB.

Reclamation stops the instance. The block volume and its data survive, and the nightly encrypted
backup in Object Storage is the second copy (`deploy/cron/backup.sh`). The certificate URLs, though,
go dark until someone restarts the instance. A buyer scanning a QR code during that time sees nothing.

## Options

| | Pay-As-You-Go (recommended) | keep-busy job |
|---|---|---|
| What | Upgrade the tenancy in the OCI Console (Upgrade link in the banner). No commitment. | `deploy/cron/keep-busy.sh` from cron, every hour. |
| Cost | Nothing while usage stays within the Always Free limits. A card is on file, and anything beyond the limits is billed. | Wasted CPU and power, every hour, forever. It keeps the instance "busy" on purpose. |
| Idle reclamation | Does not apply (Oracle's page). | Avoided only while CPU p95 stays over 20 %, and only if Oracle's rule stays as written. |
| Risk | A misconfigured paid resource could cost money. Set a budget alert in the OCI Console (e.g. ₹100) with an email. | Oracle can change the rule (it has before). The load can slow the app. It is capped and runs at nice 19, so the app wins the CPU. |
| Work | Owner: one console upgrade and a budget alert. | Uncomment one line in `/etc/cron.d/udgam` (from `deploy/cron/crontab`). |

**Recommendation: Pay-As-You-Go plus a budget alert.** It removes the problem at its source and
costs nothing within the free limits. keep-busy exists only for the case where the owner declines a
card on file.

## keep-busy, if chosen

`deploy/cron/keep-busy.sh [minutes]`:

- It holds about `KEEP_BUSY_PERCENT` (default 25, capped at 40) of the instance's total CPU for the
  given minutes (default 55, capped at 59).
- Each core runs a 1-second duty cycle: a busy-loop burst, then a sleep.
- It runs at `nice 19`, so any real work preempts it.
- `flock` allows one copy at a time. It writes nothing but its log lines.

Cron starts it every hour, so the instance sits near 25 % CPU almost all the time, above Oracle's
20 % p95 line. Lifting CPU alone is enough, because Oracle needs all three conditions to call an
instance idle.

To turn it on:

```sh
sudo sed -i 's|^# 0 \* \* \* \* root /opt/udgam/deploy/cron/keep-busy.sh|0 * * * * root /opt/udgam/deploy/cron/keep-busy.sh|' /etc/cron.d/udgam
```

`deploy/bootstrap.sh` keeps `/etc/cron.d/udgam` equal to the repository's copy. So if keep-busy is
chosen, uncomment the line in `deploy/cron/crontab` too, in a commit that names the EXE decision.
Otherwise the next bootstrap run turns it off again.

To check it on the instance after a day, open OCI Console → Compute → the instance → Metrics. CPU
utilisation should hover near 25 %. Re-check that the app's p95 latency hasn't moved
(`docs/ops/monitoring.md`).

**Local evidence only.** On the shared 4-core cloud VM (load average 5.6 from other work), a 6-second
run used 11 % of the CPU, not 25 %. That is nice 19 giving way, as designed. The real share on an
otherwise idle A1 instance is an **on-instance check, BLOCKED** until the instance exists.
