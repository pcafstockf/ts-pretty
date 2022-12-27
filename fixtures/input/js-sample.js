do if (parent.nodeName.toLowerCase() === 'div') break; while (parent = parent.parentNode);
businessUnitList.forEach((businessUnit) => {
	fbdata.data[businessUnit] = []
	for (let i = 0; i < 30; i++) {
		setTimeout(() => {
			const startDay = moment().subtract(i + 1, 'days')
			const endDay = moment().subtract(i, 'days')
			const start = `${startDay.format('YYYY')}-${startDay.format('MM')}-${startDay.format('DD')}`
			const end = `${endDay.format('YYYY')}-${endDay.format('MM')}-${endDay.format('DD')}`
			getFBdata(businessUnit, {
				since: start,
				until: end,
			}, i, fbdata.data[businessUnit])
		}, i * 3000)
	}
})


