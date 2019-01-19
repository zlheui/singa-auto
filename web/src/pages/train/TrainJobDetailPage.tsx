import * as React from 'react';
import { withStyles, StyleRulesCallback } from '@material-ui/core/styles';
import { Typography, Paper, CircularProgress, Divider, Grid, Card, CardContent, CardActions,
  Table, TableHead, TableCell, TableBody, TableRow, IconButton, Button } from '@material-ui/core';
import { Pageview } from '@material-ui/icons';
import * as moment from 'moment';
import * as _ from 'lodash';

import { AppUtils } from '../../App';
import { AppRoute } from '../../app/AppNavigator';
import { Trial } from '../../../client/RafikiClient';
import { PlotOption, PlotSeries } from '../../app/PlotManager';

interface Props {
  classes: { [s: string]: any };
  appUtils: AppUtils;
  app: string;
  appVersion: number;
}

class TrainJobDetailPage extends React.Component<Props> {
  state: {
    trials: Trial[] | null,
    modelDescriptions: ModelDescription[]
  } = {
    trials: null,
    modelDescriptions: []
  }

  async componentDidMount() {
    this.updateTrials();
  }

  componentDidUpdate() {
    this.updatePlots();
  }

  updatePlots() {
    const { modelDescriptions } = this.state;
    const { appUtils: { plotManager } } = this.props;

    for (const desc of modelDescriptions) {
      const trials = desc.completedTrials;
      const model = desc.model;
      const { series, plotOption } = getPlotDetails(trials);
      plotManager.updatePlot(`plot-${model}`, series, plotOption);
    }
  }

  goToTrial(trialId: string) {
    const { appUtils: { appNavigator } } = this.props;
    const link = AppRoute.TRIAL_DETAIL
      .replace(':trialId', trialId)
    appNavigator.goTo(link);
  }

  async updateTrials() {
    const { appUtils: { rafikiClient, showError }, app, appVersion } = this.props;
    try {
      const trials = await rafikiClient.getTrialsOfTrainJob(app, appVersion);
      const modelDescriptions = [];
      const trialsByModels = _.groupBy(trials, x => x.model_name);
      for (const model of Object.keys(trialsByModels)) {
        const trials = trialsByModels[model];
        const completedTrials = trials.filter(x => x.status == 'COMPLETED');
        
        if (completedTrials.length == 0) {
          continue;
        }

        const status = trials.find(x => x.status == 'RUNNING') ? 'RUNNING' : 'DONE';
        let bestTrial: Trial = null;
        let totalDuration = moment.duration(0);
        for (const trial of completedTrials) {
          if (!bestTrial || trial.score > bestTrial.score) {
            bestTrial = trial;
          }

          // @ts-ignore
          const dur = moment.duration(trial.datetime_stopped - trial.datetime_started);
          totalDuration = totalDuration.add(dur);
        }

        const desc: ModelDescription = {
          model,
          status,
          completedTrials,
          totalDuration,
          bestTrial
        };
        modelDescriptions.push(desc);
      }
      this.setState({ trials, modelDescriptions });
    } catch (error) {
      showError(error, 'Failed to retrieve trials for train job');
    }
  }

  renderTrials() {
    const { classes } = this.props;
    const { trials } = this.state;

    return (
      <React.Fragment>
        <Typography gutterBottom variant="h3">All Trials</Typography>
        <Paper className={classes.trialsPaper}>
          <Table padding="dense">
            <TableHead>
              <TableRow>
                <TableCell padding="none"></TableCell>
                <TableCell>ID</TableCell>
                <TableCell>Model</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Score</TableCell>
                <TableCell>Started At</TableCell>
                <TableCell>Stopped At</TableCell>
                <TableCell>Duration</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {trials.map(x => {
                return (
                  <TableRow key={x.id} hover>
                    <TableCell padding="none">
                      <IconButton onClick={() => this.goToTrial(x.id)}>
                        <Pageview /> 
                      </IconButton>
                    </TableCell>
                    <TableCell>{x.id}</TableCell>
                    <TableCell>{x.model_name}</TableCell>
                    <TableCell>{x.status}</TableCell>
                    <TableCell>{x.score}</TableCell>
                    <TableCell>{moment(x.datetime_started).fromNow()}</TableCell>
                    <TableCell>{x.datetime_stopped ? moment(x.datetime_stopped).fromNow(): '-'}</TableCell>
                    <TableCell>{
                      x.datetime_stopped ? 
                        // @ts-ignore
                        moment.duration(x.datetime_stopped - x.datetime_started).humanize()
                          : '-'
                      }</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      </React.Fragment>
    )
  }

  renderModelDescription() {
    const { modelDescriptions } = this.state;
    const { classes } = this.props;

    return (
      <React.Fragment>
        <Typography gutterBottom variant="h3">Performance by Model</Typography>
        <Grid container>
          {modelDescriptions.map(x => (
            <Grid key={x.model} item xs={12} sm={6}>
              <Card className={classes.modelCard}>
                <CardContent>
                  <Typography gutterBottom variant="h5">{x.model}</Typography>
                  {
                    x.status == 'RUNNING' &&
                    <Typography><strong>Trials are still running</strong>.</Typography>
                  }
                  <Typography><strong>{x.completedTrials.length}</strong> trials were completed over total of <strong>{x.totalDuration.humanize()}</strong>.</Typography>
                  {
                    x.bestTrial &&
                    <Typography>Best trial scored <strong>{x.bestTrial.score}</strong>.</Typography>
                  }
                  <div id={`plot-${x.model}`} className={classes.modelPlot}></div>
                </CardContent>
                <CardActions>
                  {
                    x.bestTrial &&
                    <Button onClick={() => this.goToTrial(x.bestTrial.id)} size="small" color="primary">
                      Go to Best Trial
                    </Button>
                  }
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      </React.Fragment>
    )
  }

  render() {
    const { classes, app, appVersion } = this.props;
    const { trials, modelDescriptions } = this.state;

    return (
      <React.Fragment>
        <Typography gutterBottom variant="h2">
          Train Job 
          <span className={classes.headerSub}>{`(${app} V${appVersion})`}</span>
        </Typography>
        {
          trials &&
          <React.Fragment>
            {
              modelDescriptions && modelDescriptions.length > 0 &&
              <React.Fragment>
                {this.renderModelDescription()}
                <Divider className={classes.divider} />
              </React.Fragment>
            }
            {this.renderTrials()}
          </React.Fragment>
        }
        {
          !trials &&
          <CircularProgress />
        }
      </React.Fragment>
    );
  }
}

function getPlotDetails(trials: Trial[]): 
  { series: PlotSeries[], plotOption: PlotOption } {
  const trialsOverTime = _.sortBy(trials, x => x.datetime_started);
  const bestScoreSeries: PlotSeries = {
    name: 'Score',
    data: []
  };
  
  let bestScore = 0;
  for (const trial of trialsOverTime) {
    bestScore = Math.max(trial.score, bestScore);
    bestScoreSeries.data.push([trial.datetime_started, bestScore]);
  }

  const plotOption: PlotOption = {
    title: 'Best trial score over time',
    xAxis: {
      name: 'Time',
      type: 'time'
    }
  }

  return { series: [bestScoreSeries], plotOption };
}

interface ModelDescription {
  model: string;
  status: 'RUNNING' | 'DONE';
  completedTrials: Trial[];
  totalDuration: moment.Duration;
  bestTrial?: Trial;
}

const styles: StyleRulesCallback = (theme) => ({
  headerSub: {
    fontSize: theme.typography.h4.fontSize,
    margin: theme.spacing.unit * 2
  },
  trialsPaper: {
    overflowX: 'auto'
  },
  divider: {
    margin: theme.spacing.unit * 4
  },
  modelCard: {
    margin: theme.spacing.unit
  },
  modelPlot: {
    width: '100%',
    maxWidth: 800,
    height: 500,
    padding: theme.spacing.unit,
    paddingTop: theme.spacing.unit * 2
  },
});

export default withStyles(styles)(TrainJobDetailPage);