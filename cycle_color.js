function getRGB(hexCode) {
    let h = hexCode.trim()
    if (h.startsWith("#")) {
        h = h.substring(1)
    }
    let components = h.match(/.{1,2}/g)
    let rgb = {
        r: parseInt(components[0], 16),
        g: parseInt(components[1], 16),
        b: parseInt(components[2], 16)
    }
    return rgb
}

function getRGBList(hexList) {
    let result = []
    for (let i = 0; i < hexList.length; i++) {
        result.push(getRGB(hexList[i]))
    }
    return result
}

function getIntermediaryColors(c1, c2, steps) {
    let rStep = (c2.r - c1.r) / steps
    let gStep = (c2.g - c1.g) / steps
    let bStep = (c2.b - c1.b) / steps
    let result = []
    result.push(c1)
    for (let i = 1; i < steps; i++) {
        let current = {
            r: c1.r + i * rStep,
            g: c1.g + i * gStep,
            b: c1.b + i * bStep
        }
        result.push(current)
    }
    result.push(c2)
    return result
}

function pickBasedOnTimestamp(arr, refreshRate) {
    let index = Math.floor(+ new Date() / refreshRate) % arr.length
    return arr[index]
}

function cycleColor(elementId, property, palette, colorTransitionSteps = 50, refreshRate = 80) {
    let colors = getCycleColors(palette, colorTransitionSteps)
    let cycleFunction = function() {
        let currentColor = pickBasedOnTimestamp(colors, refreshRate)
        let cssColor = "rgb(" + currentColor.r + "," + currentColor.g + "," + currentColor.b + ")"
        let path = document.getElementById(elementId)
        path.style[property] = cssColor
        setTimeout(cycleFunction, refreshRate)
    }
    cycleFunction()
}

function getCycleColors(colors, stepsBetweenColors) {
    let rgbColors = getRGBList(colors)
    let result = []
    for (let i = 0; i < rgbColors.length-1; i++) {
        result = result.concat(getIntermediaryColors(rgbColors[i], rgbColors[i+1], stepsBetweenColors))
    }
    result = result.concat(getIntermediaryColors(rgbColors[rgbColors.length-1], rgbColors[0], stepsBetweenColors))
    return result
}