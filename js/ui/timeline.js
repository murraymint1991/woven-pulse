// Timeline (only narrative surface we show)
h("div", { class: "card diary-card" }, [
  h("h3", null, "Timeline"),
  (Object.keys(grouped).length === 0)
    ? h("div", { class: "small" }, "— no timeline entries yet —")
    : null,
  ...Object.entries(grouped).map(([day, entries]) =>
    h("div", { class: "diary-day" }, [
      h("div", { class: "diary-meta" }, [
        h(Badge, null, day),
        ...((entries[0].mood || []).map((m, i) =>
          h(Badge, { ghost: true, key: `m${day}-${i}` }, m)
        )),
        ...((entries[0].tags || []).map((t, i) =>
          h(Badge, { ghost: true, key: `t${day}-${i}` }, t)
        ))
      ]),
      ...entries.map((e, i) =>
        h("div", { class: "diary-hand", key: e.id || `${day}-${i}` }, [
          h("p", null, e.text),
          ...((e.asides || []).map((a, j) =>
            h("p", { class: "diary-thought", key: `${e.id || `${day}-${i}`}-a${j}` }, a)
          ))
        ])
      )
    ])
  )
])
