import React from 'react';
import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';
import { t } from '../locales';
import { getScale } from '../modules/CategoricalColorNamespace';
import { wrapSvgText } from '../modules/utils';
import $ from 'jquery';
import d3 from 'd3';
import './sunburst.css';
import { VIZ_TYPES } from './';

const propTypes = {
  selector: PropTypes.string.isRequired,
  data: PropTypes.arrayOf(PropTypes.array),
  width: PropTypes.number,
  height: PropTypes.number,
  colorScheme: PropTypes.string,
  addFilter: PropTypes.func,
  metric: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.object, // The metric object
  ]),
  secondaryMetric: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.object, // The metric object
  ]),
};
const defaultProps = {};

class Sunburst extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      selectedValues: props.origSelectedValues,
    };
    this.renderChart = this.renderChart.bind(this);
    this.getAncestors = this.getAncestors.bind(this);
    this.metricLabel = this.metricLabel.bind(this);
    this.resize = this.resize.bind(this);
  }

  resize() {
    const element = document.querySelector(this.props.selector);
    this.renderChart(element, {
      data: this.props.data,
      width: this.props.width(),
      height: this.props.height(),
      colorScheme: this.props.colorScheme,
      metrics: [this.props.metric, this.props.secondaryMetric],
    }, this.getAncestors, this.metricLabel);
  }

  componentDidMount() {
    const element = document.querySelector(this.props.selector);
    this.renderChart(element, {
      data: this.props.data,
      width: this.props.width,
      height: this.props.height,
      colorScheme: this.props.colorScheme,
      metrics: [this.props.metric, this.props.secondaryMetric],
    }, this.getAncestors, this.metricLabel);
    //window.addEventListener('resize', this.resize);
  }

  componentDidUpdate() {
    const element = document.querySelector(this.props.selector);
    this.renderChart(element, {
      data: this.props.data,
      width: this.props.width,
      height: this.props.height,
      colorScheme: this.props.colorScheme,
      metrics: [this.props.metric, this.props.secondaryMetric],
    }, this.getAncestors, this.metricLabel);
  }

  filterData(datum) {
    const selectedValues = Object.assign({}, this.state.selectedValues);
    if(datum.filter) {
      if(selectedValues.hasOwnProperty(datum.filter) && !selectedValues[datum.filter].includes(datum.name)) {
        selectedValues[datum.filter].push(datum.name);
      } else if (selectedValues.hasOwnProperty(datum.filter) && selectedValues[datum.filter].includes(datum.name)) { 
        var index = selectedValues[datum.filter].indexOf(datum.name);
        if (index > -1) selectedValues[datum.filter].splice(index, 1);
        if (selectedValues[datum.filter].length == 0) {
          delete selectedValues[datum.filter];
        }
      } else {
        selectedValues[datum.filter] = [datum.name];
      }
      this.setState({ selectedValues });
      this.props.addFilter(datum.filter, selectedValues[datum.filter], false, true);
    }
  }

  getAncestors(node) {
    const path = [];
    let current = node;
    while (current.parent) {
      path.unshift(current);
      current = current.parent;
    }
    return path;
  }

  metricLabel(metric) {
    return ((typeof metric) === 'string' || metric instanceof String)
      ? metric
      : metric.label;
  }

  renderChart(element, props, getAncestors, metricLabel) {
    const filterData = this.filterData.bind(this);
    const container = d3.select(element);
    const {
      width,
      height,
      colorScheme,
      metrics,
    } = props;
    const data = props.data.data;
    const slice_id = /\d+/.exec(element.id)[0];
    // vars with shared scope within this function
    const margin = { top: 10, right: 5, bottom: 10, left: 5 };
    const containerWidth = width;
    const containerHeight = height;
    const breadcrumbHeight = containerHeight * 0.085;
    const visWidth = containerWidth - margin.left - margin.right;
    const visHeight = containerHeight - margin.top - margin.bottom - breadcrumbHeight;
    const radius = Math.min(visWidth, visHeight) / 2;

    let colorByCategory = true; // color by category if primary/secondary metrics match
    let maxBreadcrumbs;
    let breadcrumbDims; // set based on data
    let totalSize; // total size of all segments; set after loading the data.
    let colorScale;
    let breadcrumbs;
    let vis;
    let arcs;
    let gMiddleText; // dom handles

    const colorFn = getScale(colorScheme).toFunction();

    // Helper + path gen functions
    const partition = d3.layout.partition()
      .size([2 * Math.PI, radius * radius])
      .value(function (d) { return d.m1; });

    const arc = d3.svg.arc()
      .startAngle(d => d.x)
      .endAngle(d => d.x + d.dx)
      .innerRadius(d => Math.sqrt(d.y))
      .outerRadius(d => Math.sqrt(d.y + d.dy));

    const textArc = d3.svg.arc()
      .startAngle(function(d) {
        if(d.x < Math.PI){
          return d.x + d.dx;
        } else {
          return d.x;
        }
      })
      .endAngle(function(d) {
        if(d.x < Math.PI){
          return d.x;
        } else {
          return d.x + d.dx;
        }
      })
      .innerRadius(d => (Math.sqrt(d.y + d.dy) - Math.sqrt(d.y))/2 + Math.sqrt(d.y))
      .outerRadius(d => (Math.sqrt(d.y + d.dy) - Math.sqrt(d.y))/2 + Math.sqrt(d.y));

    const textFits = d => {
        const CHAR_SPACE = 6;

        const deltaAngle = d.dx;
        const r = Math.max(0, (Math.sqrt(d.y) + Math.sqrt(d.y + d.dy)) / 2);
        const perimeter = r * deltaAngle;

        return d.name.length * CHAR_SPACE + 5 < perimeter;
    };

    const formatNum = d3.format('.1s');
    const formatPerc = d3.format('.1p');

    container.select('svg').remove();

    const svg = container.append('svg:svg')
      .attr('width', containerWidth)
      .attr('height', containerHeight);

    function createBreadcrumbs(firstRowData) {
      // -2 bc row contains 2x metrics, +extra for %label and buffer
      maxBreadcrumbs = (firstRowData.length - 2) + 1;
      breadcrumbDims = {
        width: visWidth / maxBreadcrumbs,
        height: breadcrumbHeight * 0.8, // more margin
        spacing: 3,
        tipTailWidth: 10,
      };

      breadcrumbs = svg.append('svg:g')
        .attr('class', 'breadcrumbs')
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

      breadcrumbs.append('svg:text')
        .attr('class', 'end-label');
    }

    // Generate a string that describes the points of a breadcrumb polygon.
    function breadcrumbPoints(d, i) {
      const points = [];
      points.push('0,0');
      points.push(breadcrumbDims.width + ',0');
      points.push(
        breadcrumbDims.width + breadcrumbDims.tipTailWidth + ',' + (breadcrumbDims.height / 2));
      points.push(breadcrumbDims.width + ',' + breadcrumbDims.height);
      points.push('0,' + breadcrumbDims.height);
      if (i > 0) { // Leftmost breadcrumb; don't include 6th vertex.
        points.push(breadcrumbDims.tipTailWidth + ',' + (breadcrumbDims.height / 2));
      }
      return points.join(' ');
    }

    function updateBreadcrumbs(sequenceArray, percentageString) {
      const g = breadcrumbs.selectAll('g')
        .data(sequenceArray, d => d.name + d.depth);

      // Add breadcrumb and label for entering nodes.
      const entering = g.enter().append('svg:g');

      entering.append('svg:polygon')
          .attr('points', breadcrumbPoints)
          .style('fill', function (d) {
            return colorByCategory ?
              colorFn(d.name) :
              colorScale(d.m2 / d.m1);
          });

      entering.append('svg:text')
          .attr('x', (breadcrumbDims.width + breadcrumbDims.tipTailWidth) / 2)
          .attr('y', breadcrumbDims.height / 4)
          .attr('dy', '0.35em')
          .style('fill', function (d) {
            // Make text white or black based on the lightness of the background
            const col = d3.hsl(colorByCategory ?
              colorFn(d.name) :
              colorScale(d.m2 / d.m1));
            return col.l < 0.5 ? 'white' : 'black';
          })
          .attr('class', 'step-label')
          .text(function (d) { return d.name.replace(/_/g, ' '); })
          .call(wrapSvgText, breadcrumbDims.width, breadcrumbDims.height / 2);

      // Set position for entering and updating nodes.
      g.attr('transform', function (d, i) {
        return 'translate(' + i * (breadcrumbDims.width + breadcrumbDims.spacing) + ', 0)';
      });

      // Remove exiting nodes.
      g.exit().remove();

      // Now move and update the percentage at the end.
      breadcrumbs.select('.end-label')
          .attr('x', (sequenceArray.length + 0.5) * (breadcrumbDims.width + breadcrumbDims.spacing))
          .attr('y', breadcrumbDims.height / 2)
          .attr('dy', '0.35em')
          .text(percentageString);

      // Make the breadcrumb trail visible, if it's hidden.
      breadcrumbs.style('visibility', null);
    }

    // Fade all but the current sequence, and show it in the breadcrumb trail.
    function mouseenter(d) {
      const sequenceArray = getAncestors(d);
      const parentOfD = sequenceArray[sequenceArray.length - 2] || null;

      const absolutePercentage = (d.m1 / totalSize).toPrecision(3);
      const conditionalPercentage = parentOfD ? (d.m1 / parentOfD.m1).toPrecision(3) : null;

      const absolutePercString = formatPerc(absolutePercentage);
      const conditionalPercString = parentOfD ? formatPerc(conditionalPercentage) : '';

      // 3 levels of text if inner-most level, 4 otherwise
      const yOffsets = ['-25', '7', '35', '60'];
      let offsetIndex = 0;

      // If metrics match, assume we are coloring by category
      const metricsMatch = Math.abs(d.m1 - d.m2) < 0.00001;

      gMiddleText.selectAll('*').remove();

      /**gMiddleText.append('text')
        .attr('class', 'path-abs-percent')
        .attr('y', yOffsets[offsetIndex++])
        .text(absolutePercString + ' of total');

      if (conditionalPercString) {
        gMiddleText.append('text')
          .attr('class', 'path-cond-percent')
          .attr('y', yOffsets[offsetIndex++])
          .text(conditionalPercString + ' of parent');
      }**/

      gMiddleText.append('text')
        .attr('class', 'path-abs-percent')
        .attr('y', yOffsets[offsetIndex+3])
        .text(`${metricLabel(metrics[0])}: ${formatNum(d.m1)}` + (metricsMatch ? '' : `, ${metricLabel(metrics[1])}: ${formatNum(d.m2)}`));

      /**gMiddleText.append('text')
        .attr('class', 'path-ratio')
        .attr('y', yOffsets[offsetIndex++])
        .text((metricsMatch ? '' : (`${metricLabel(metrics[1])}/${metricLabel(metrics[0])}: ${formatPerc(d.m2 / d.m1)}`)));**/

      // Reset and fade all the segments.
      arcs.selectAll('path')
        .style('stroke-width', null)
        .style('stroke', null)
        .style('opacity', 0.3);

      // Then highlight only those that are an ancestor of the current segment.
      arcs.selectAll('path')
        .filter(node => (sequenceArray.indexOf(node) >= 0))
        .style('opacity', 1)
        .style('stroke', '#aaa');

      updateBreadcrumbs(sequenceArray, absolutePercString);
    }

    // Restore everything to full opacity when moving off the visualization.
    function mouseleave() {
      // Hide the breadcrumb trail
      breadcrumbs.style('visibility', 'hidden');

      gMiddleText.selectAll('*').remove();

      // Deactivate all segments during transition.
      arcs.selectAll('path').on('mouseenter', null);

      // Transition each segment to full opacity and then reactivate it.
      arcs.selectAll('path')
        .transition()
        .duration(200)
        .style('opacity', 1)
        .style('stroke', null)
        .style('stroke-width', null)
        .each('end', function () {
          d3.select(this).on('mouseenter', mouseenter);
        });
    }


    function buildHierarchy(d) {
      const rows = d.data;
      const root = {
        name: 'root',
        children: [],
      };

      // each record [groupby1val, groupby2val, (<string> or 0)n, m1, m2]
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const m1 = Number(row[row.length - 2]);
        const m2 = Number(row[row.length - 1]);
        const levels = row.slice(0, row.length - 2);
        if (Number.isNaN(m1)) { // e.g. if this is a header row
          continue;
        }
        let currentNode = root;
        for (let level = 0; level < levels.length; level++) {
          const children = currentNode.children || [];
          const nodeName = levels[level].toString();
          // If the next node has the name '0', it will
          const isLeafNode = (level >= levels.length - 1) || levels[level + 1] === 0;
          let childNode;
          let currChild;

          if (!isLeafNode) {
            // Not yet at the end of the sequence; move down the tree.
            let foundChild = false;
            for (let k = 0; k < children.length; k++) {
              currChild = children[k];
              if (currChild.name === nodeName &&
                  currChild.level === level) {
              // must match name AND level
                childNode = currChild;
                foundChild = true;
                break;
              }
            }
            // If we don't already have a child node for this branch, create it.
            if (!foundChild) {
              childNode = {
                name: nodeName,
                children: [],
                level,
                filter: d.columns[level],
              };
              children.push(childNode);
            }
            currentNode = childNode;
          } else if (nodeName !== 0) {
            // Reached the end of the sequence; create a leaf node.
            childNode = {
              name: nodeName,
              m1,
              m2,
              filter: d.columns[level],
            };
            children.push(childNode);
          }
        }
      }

      function recurse(node) {
        if (node.children) {
          let sums;
          let m1 = 0;
          let m2 = 0;
          for (let i = 0; i < node.children.length; i++) {
            sums = recurse(node.children[i]);
            m1 += sums[0];
            m2 += sums[1];
          }
          node.m1 = m1;
          node.m2 = m2;
        }
        return [node.m1, node.m2];
      }

      recurse(root);
      return root;
    }

    // Main function to draw and set up the visualization, once we have the data.
    function createVisualization(rows) {
      const root = buildHierarchy(rows);

      vis = svg.append('svg:g')
        .attr('class', 'sunburst-vis')
        .attr('transform', (
          'translate(' +
            `${(margin.left + (visWidth / 2))},` +
            `${(margin.top + breadcrumbHeight + (visHeight / 2))}` +
          ')'
        ))
        .on('mouseleave', mouseleave);

      arcs = vis.append('svg:g')
        .attr('id', 'arcs');

      gMiddleText = vis.append('svg:g')
        .attr('class', 'center-label');

      // Bounding circle underneath the sunburst, to make it easier to detect
      // when the mouse leaves the parent g.
      arcs.append('svg:circle')
        .attr('r', radius)
        .style('opacity', 0);

      // For efficiency, filter nodes to keep only those large enough to see.
      const nodes = partition.nodes(root)
        .filter(d => d.dx > 0.005); // 0.005 radians = 0.29 degrees

      let ext;

      if (metrics[0] !== metrics[1] && metrics[1]) {
        colorByCategory = false;
        ext = d3.extent(nodes, d => d.m2 / d.m1);
        colorScale = d3.scale.linear()
          .domain([ext[0], ext[0] + ((ext[1] - ext[0]) / 2), ext[1]])
          .range(['#00D1C1', 'gray', '#FFB400']);
      }

      var slice = arcs.selectAll('path')
          .data(nodes)
          .enter()

      slice.append('svg:path')
          .attr('display', d => d.depth ? null : 'none')
          .attr('d', arc)
          .attr('fill-rule', 'evenodd')
          .style('fill', d => colorByCategory
            ? colorFn(d.name)
            : colorScale(d.m2 / d.m1))
          .style('opacity', 1)
          .on('mouseenter', mouseenter)
          .on("click", function(d) {
            filterData(d);
          });


      slice.append('path')
          .attr('class', 'hidden-arc')
          .attr('id', (_, i) => `slice` + slice_id + `hiddenArc${i}`)
          .attr('d', textArc);

      slice.append('text')
          .attr('display', d => textFits(d) && d.name!=="root" ? null : 'none')
          .attr("dy",  5) //Move the text down
          .append('textPath')
          .attr("startOffset","25%")
          .style("text-anchor","middle")
          .attr('xlink:href', (_, i) => `#slice` + slice_id + `hiddenArc${i}` )
          .text(d => d.name)


      // Get total size of the tree = value of root node from partition.
      totalSize = root.value;
      arcs.attr("transform", "rotate(90)");
    }
    createBreadcrumbs(data[0]);
    createVisualization(props.data);
  }

  render() {
    return (<svg ref={node => this.node = node}></svg>);
  }
}

Sunburst.propTypes = propTypes;
Sunburst.defaultProps = defaultProps;

function adaptor(slice, payload) {
  ReactDOM.render(
    <Sunburst
      width={slice.width()}
      selector={slice.selector}
      height={slice.height()}
      addFilter={slice.addFilter}
      data={payload.data}
      origSelectedValues={slice.getFilters() || {}}
      colorScheme={slice.formData.color_scheme}
      metric={slice.formData.metric}
      secondaryMetric={slice.formData.secondary_metric}
    />,
    document.getElementById(slice.containerId),
  );
}

export default adaptor;