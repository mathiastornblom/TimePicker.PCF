# TimePicker.PCF ![GitHub all releases](https://img.shields.io/github/downloads/drivardxrm/TimePicker.PCF/total?style=plastic)

Time picker code component for Power Apps, built with the Power Apps component framework.

It renders a themed input with a searchable list of times, and stores the result in
whole number columns so the value is plain wall-clock time with no time zone
conversion applied anywhere.

![The picker open, showing hour, minute, second and AM/PM wheels](timepicker-v2.png)

## Supported hosts

| Host | Supported | Notes |
|---|---|---|
| Model-driven apps (Dynamics 365) | Yes | Picks up the app's Fluent theme, including dark mode |
| Canvas apps | Yes | |
| Power Pages | Yes | Both storage modes work. Stays a standard component, since Power Pages does not support React platform libraries. See the note below |

Power Pages does not reliably call the component back after it reports a change, and
when it does call back it can pass the values it held *before* the change. The component
therefore keeps the choice the user made and only takes the host's value when the host's
own data has actually moved. Without this, choosing an hour left the field showing the
old time and saved a blank one.

## Storage modes

The component reads and writes whole number columns. Which columns it uses is set by
the **Storage Mode** property.

**Hours and minutes**, the default, uses two columns, or three with seconds switched
on. `hourvalue` holds 0-23, `minutevalue` holds 0-59, and `secondvalue` holds 0-59.
The second column is only written when the seconds wheel is on, so records that do not
track seconds are left alone. Both columns are always written together, so choosing an
hour can never leave the minute column empty. A record that already holds only one of
the two is read as a real time, with the missing half treated as zero, and is left
untouched until the user actually changes the value.

**Minutes from midnight** uses one column and does not carry seconds. `hourvalue` holds
0-1439 and the other columns are left unbound. Use it when you would rather keep one column than two, or if you hit
the multi-column binding limitation that the Power Pages documentation describes. The
two column mode is known to work on Power Pages in practice, so this is an option
rather than a requirement.

## Parameters

| Parameter | Description | Default |
|---|---|---|
| `hourvalue` | Whole number column holding the hour, or the whole time in single column mode | required |
| `minutevalue` | Whole number column holding the minute. Leave unbound in single column mode | optional |
| `secondvalue` | Whole number column holding the second, 0-59. Only used when the seconds wheel is on | optional |
| `storagemode` | `Hours and minutes` (two columns) or `Minutes from midnight` (one column) | Hours and minutes |
| `displaytype` | `12 hrs`, `24 hrs`, or `Auto` to follow the user's regional settings | 24 hrs |
| `fieldappearance` | `outline`, `underline`, `filled-darker` or `filled-lighter` | outline |
| `placeholdertext` | Text shown when no time is set | none |
| `showunits` | Show a unit beside the centred row of each wheel | true |
| `hourunittext` | Text beside the hour wheel | `hours`, blank in 12 hour display |
| `minuteunittext` | Text beside the minute wheel | `min` |
| `secondunittext` | Text beside the seconds wheel | `sec` |
| `showseconds` | Add a seconds wheel and store the value in `secondvalue` | false |
| `meridiemposition` | In 12 hour display: AM/PM on its own wheel `after` or `before` the time, or `inline` in the hour wheel | after |
| `bandcolor` | CSS colour of the selection band. Blank follows the app theme | theme |
| `bandopacity` | Opacity of the selection band, 1-100 | 100 |
| `hourstep` | Interval between selectable hours | 1 |
| `minutestep` | Interval between selectable minutes. Use 60 for whole hours only | 1 |
| `secondstep` | Interval between selectable seconds | 1 |
| `minhour` | First selectable hour, 0-23 | 0 |
| `maxhour` | Last selectable hour, 1-23. Leave blank for 23 | 23 |
| `editenabled` | Allow the user to type a time as well as pick one | false |
| `showclear` | Show a button that clears the value | true |
| `defaulttime` | `Nothing`, or `Current time` to show the user's local time as the placeholder | Nothing |

The picker is a row of wheels in the style of an iOS picker: hours and minutes, plus
seconds when `showseconds` is on, plus AM/PM as its own wheel in 12 hour display. Rows
snap to a band spanning all the columns, and shrink and fade as they recede from it.
Choosing on any wheel writes the whole time, so an hour can never be stored without its
minute.

The band takes any CSS colour and an opacity, so it can be tuned to the app. Setting the
colour to `transparent` removes it. In 12 hour display the AM/PM wheel can sit after the
time, before it, or be folded into the hour wheel as `6 PM` rows.

Both wheels open on the current time when the field is empty, so local time is the
first thing the user sees. The current time comes from the Dataverse user's own time
zone when the host exposes it, and from the browser clock otherwise. A stored value
that falls outside the configured hour window, or off the step, is folded into the
wheel so the user can still see what is selected.

Scrolling is the primary interaction, but each wheel is a real listbox: rows can be
clicked, and arrow keys, Page Up and Page Down, Home and End all work.

The centred row carries a unit label, reading `18 hours` and `10 min`. Both labels are
configurable for wording and language, and can be turned off entirely. In 12 hour
display the hour label defaults to blank, because the AM/PM designator already says
what the column is.

With `editenabled` on, the field accepts `18:30`, `18.30`, `1830`, `830`, `18`,
`6:30 pm`, `6pm` and `18:30:45`. Text that cannot be understood is discarded and the field falls
back to the stored value, so the record never ends up holding junk.

## Upgrading from 1.x

The upgrade is in place. The namespace, the component name, every existing parameter
name and both column types are unchanged, so forms that already use the component keep
working without being touched. Every parameter added in 2.0 is optional and defaults to
the 1.x behaviour.

After importing the solution, run **Publish all customizations** and then reopen the
form designer in a fresh tab. Until you do, the designer keeps serving the old manifest
and the component still shows its 1.x properties. The quickest tell is the Minute Value
Field: it is optional in 2.0, so a red required asterisk beside it means you are still
looking at the cached 1.x manifest.

Existing forms need no other change. They reference the component by name rather than by
version, so the new implementation is picked up once the customizations are published.
Every property added in 2.0 takes its default on those forms, which is why they keep
behaving as they did until you configure the new options. Canvas apps are the exception:
they embed a copy of the component, so each one has to be opened in Studio, updated when
prompted, then saved and published.

Three things changed that are worth knowing about:

- `minutevalue` is now optional rather than required. Existing forms already bind it, so
  nothing breaks. Making it optional is what allows the single column mode.
- A record holding an hour but no minute used to be wiped on load. It is now read as a
  time, and the record is left alone until the user changes something.
- The look is supplied by Fluent UI and follows the host theme, so the component no
  longer ships its own hardcoded colours. The 1.x field had a transparent border, which
  is why it appeared to have no border or background on a form.

## Dependencies

[Fluent UI React v9](https://react.fluentui.dev/). The 1.x dependencies on
`rc-time-picker` and `moment` were removed; `rc-time-picker` was last released in
December 2019 and is archived upstream.

## Installation

Install directly from the solution files in the
[Releases](https://github.com/drivardxrm/TimePicker.PCF/releases) section.

## Build

Install the [Power Platform CLI](https://learn.microsoft.com/power-platform/developer/cli/introduction)
and Node.js, then:

```bash
npm install
```

Run the test harness:

```bash
npm start
```

Run the unit tests, which cover the time parsing, formatting and column mapping:

```bash
npm test
```

Produce a release bundle:

```bash
npm run build -- --buildMode production
```

Build the importable Dataverse solution from the `Solution` folder. This works on
macOS and Linux as well as Windows, and needs only the .NET SDK:

```bash
dotnet build -c Release
```

`Solution.zip` (unmanaged) and `Solution_managed.zip` are written to
`Solution/bin/Release`. Change `SolutionPackageType` in `Solution/Solution.cdsproj` to
switch between `Managed`, `Unmanaged` and `Both`.

To push the component straight into an environment while developing, without packaging
a solution:

```bash
pac auth create --environment <environment url>
pac pcf push --publisher-prefix driv
```
